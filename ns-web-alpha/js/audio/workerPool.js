/**
 * NoiseShaper Web - Worker Pool Manager
 * 
 * Manages a pool of Web Workers for parallel FFT processing during exports
 * 
 * Features:
 * - Dynamic worker pool sizing based on hardware concurrency
 * - Job queue management with priority handling
 * - Efficient data transfer using Transferable Objects
 * - Progress aggregation from multiple workers
 * - Graceful error handling and worker recovery
 * - Memory-efficient chunk processing
 */

class WorkerPool {
    constructor(poolSize = null) {
        // Determine optimal pool size
        this.poolSize = poolSize || Math.min(navigator.hardwareConcurrency || 4, 8);
        console.log('🎯 WORKER POOL: Initializing with', this.poolSize, 'workers');
        
        // Worker management
        this.workers = [];
        this.availableWorkers = [];
        this.busyWorkers = new Set();
        this.workerJobs = new Map(); // Track which worker is processing which job
        
        // Job queue management
        this.jobQueue = [];
        this.jobIdCounter = 0;
        this.activeJobs = new Map();
        this.completedJobs = 0;
        this.totalJobs = 0;
        
        // Performance tracking
        this.startTime = 0;
        this.completionTimes = [];
        
        // Error handling
        this.maxRetries = 3;
        this.workerErrors = new Map();
        
        // Progress callback
        this.progressCallback = null;
        
        // Initialize workers
        this.isInitialized = false;
        this.initPromise = this.initializeWorkers();
    }

    /**
     * Initialize the worker pool
     */
    async initializeWorkers() {
        console.log('🎯 WORKER POOL: Creating', this.poolSize, 'FFT processing workers...');
        
        try {
            // Check Web Workers support
            if (typeof Worker === 'undefined') {
                throw new Error('Web Workers not supported in this browser');
            }
            
            // Create workers
            const workerPromises = [];
            for (let i = 0; i < this.poolSize; i++) {
                const workerPromise = this.createWorker(i);
                workerPromises.push(workerPromise);
            }
            
            // Wait for all workers to initialize
            await Promise.all(workerPromises);
            
            this.isInitialized = true;
            console.log('🎯 WORKER POOL: Successfully initialized', this.workers.length, 'workers');
            
            return true;
            
        } catch (error) {
            console.warn('🎯 WORKER POOL: Failed to initialize workers:', error.message);
            console.log('🎯 WORKER POOL: Will fall back to sequential processing');
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * Create a single worker
     */
    async createWorker(workerId) {
        return new Promise((resolve, reject) => {
            try {
                const worker = new Worker('workers/fft-processor-worker.js');
                
                worker.workerId = workerId;
                worker.isAvailable = true;
                worker.currentJob = null;
                
                // Handle worker messages
                worker.onmessage = (event) => this.handleWorkerMessage(worker, event);
                
                // Handle worker errors
                worker.onerror = (error) => this.handleWorkerError(worker, error);
                
                // Handle worker termination
                worker.onmessageerror = (error) => this.handleWorkerError(worker, error);
                
                // Send initialization message
                worker.postMessage({
                    type: 'init',
                    workerId: workerId
                });
                
                // Set timeout for initialization
                const initTimeout = setTimeout(() => {
                    reject(new Error(`Worker ${workerId} initialization timeout`));
                }, 5000);
                
                // Wait for init response
                const originalOnMessage = worker.onmessage;
                worker.onmessage = (event) => {
                    if (event.data.type === 'initialized') {
                        clearTimeout(initTimeout);
                        worker.onmessage = originalOnMessage;
                        
                        this.workers.push(worker);
                        this.availableWorkers.push(worker);
                        
                        console.log(`🎯 WORKER ${workerId}: Initialized successfully`);
                        resolve(worker);
                    } else {
                        originalOnMessage(event);
                    }
                };
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Process multiple chunks in parallel
     */
    async processChunksParallel(chunks, trackConfig, settings) {
        if (!this.isInitialized) {
            throw new Error('Worker pool not initialized');
        }
        
        console.log('🎯 WORKER POOL: Processing', chunks.length, 'chunks in parallel');
        
        this.startTime = performance.now();
        this.totalJobs = chunks.length;
        this.completedJobs = 0;
        this.completionTimes = [];
        
        // Create jobs for all chunks
        const jobs = chunks.map((chunkData, index) => ({
            id: this.jobIdCounter++,
            chunkIndex: index,
            chunkData: chunkData.samples,
            chunkDuration: chunkData.duration,
            trackConfig: trackConfig,
            settings: settings,
            sampleRate: settings.exportSampleRate || 44100
        }));
        
        // Process jobs in batches to manage memory
        const maxConcurrentJobs = this.poolSize;
        const results = new Array(chunks.length);
        
        for (let batchStart = 0; batchStart < jobs.length; batchStart += maxConcurrentJobs) {
            const batchEnd = Math.min(batchStart + maxConcurrentJobs, jobs.length);
            const batchJobs = jobs.slice(batchStart, batchEnd);
            
            console.log(`🎯 WORKER POOL: Processing batch ${Math.floor(batchStart / maxConcurrentJobs) + 1} (jobs ${batchStart} to ${batchEnd - 1})`);
            
            // Process batch in parallel
            const batchPromises = batchJobs.map(job => this.processJob(job));
            const batchResults = await Promise.all(batchPromises);
            
            // Store results in correct order
            batchJobs.forEach((job, index) => {
                results[job.chunkIndex] = batchResults[index];
            });
            
            // Report batch completion
            this.reportProgress();
        }
        
        const totalTime = performance.now() - this.startTime;
        console.log(`🎯 WORKER POOL: Completed all ${chunks.length} chunks in ${totalTime.toFixed(2)}ms`);
        console.log(`🎯 WORKER POOL: Average time per chunk: ${(totalTime / chunks.length).toFixed(2)}ms`);
        
        return results;
    }

    /**
     * Process a single job using available worker
     */
    async processJob(job) {
        return new Promise((resolve, reject) => {
            job.resolve = resolve;
            job.reject = reject;
            job.retryCount = 0;
            job.startTime = performance.now();
            
            this.activeJobs.set(job.id, job);
            
            // Try to assign job immediately
            if (this.availableWorkers.length > 0) {
                this.assignJobToWorker(job);
            } else {
                // Add to queue if no workers available
                this.jobQueue.push(job);
            }
        });
    }

    /**
     * Assign job to available worker
     */
    assignJobToWorker(job) {
        const worker = this.availableWorkers.shift();
        if (!worker) {
            this.jobQueue.push(job);
            return;
        }
        
        // Mark worker as busy
        worker.isAvailable = false;
        worker.currentJob = job;
        this.busyWorkers.add(worker);
        this.workerJobs.set(worker.workerId, job);
        
        console.log(`🎯 WORKER ${worker.workerId}: Processing chunk ${job.chunkIndex}`);
        
        // Prepare transferable objects for efficient data transfer
        const chunkBuffer = job.chunkData.buffer.slice();
        
        // Clean settings object - remove functions that can't be transferred to workers
        const cleanSettings = {
            enableNormalization: job.settings.enableNormalization,
            normalizeValue: job.settings.normalizeValue,
            exportAmplitude: job.settings.exportAmplitude,
            exportSampleRate: job.settings.exportSampleRate,
            enableFadeIn: job.settings.enableFadeIn,
            enableFadeOut: job.settings.enableFadeOut,
            fadeInDuration: job.settings.fadeInDuration,
            fadeOutDuration: job.settings.fadeOutDuration,
            fadeInPower: job.settings.fadeInPower,
            fadeOutPower: job.settings.fadeOutPower,
            fadeBeforeNorm: job.settings.fadeBeforeNorm
            // Exclude onProgress callback - workers don't need it
        };
        
        // Send job to worker
        worker.postMessage({
            type: 'processChunk',
            jobId: job.id,
            chunkData: new Float32Array(chunkBuffer),
            chunkDuration: job.chunkDuration,
            trackConfig: job.trackConfig,
            settings: cleanSettings,
            sampleRate: job.sampleRate
        }, [chunkBuffer]); // Transfer buffer ownership to worker
    }

    /**
     * Handle messages from workers
     */
    handleWorkerMessage(worker, event) {
        const { type, jobId, data, error } = event.data;
        
        switch (type) {
            case 'chunkComplete':
                this.handleJobComplete(worker, jobId, data);
                break;
                
            case 'chunkError':
                this.handleJobError(worker, jobId, error);
                break;
                
            case 'progress':
                this.handleWorkerProgress(worker, data);
                break;
                
            default:
                console.warn(`🎯 WORKER ${worker.workerId}: Unknown message type:`, type);
        }
    }

    /**
     * Handle job completion
     */
    handleJobComplete(worker, jobId, resultData) {
        const job = this.activeJobs.get(jobId);
        if (!job) {
            console.warn(`🎯 WORKER ${worker.workerId}: Completed unknown job ${jobId}`);
            return;
        }
        
        const processingTime = performance.now() - job.startTime;
        this.completionTimes.push(processingTime);
        
        console.log(`🎯 WORKER ${worker.workerId}: Completed chunk ${job.chunkIndex} in ${processingTime.toFixed(2)}ms`);
        
        // Mark worker as available
        this.releaseWorker(worker);
        
        // Resolve job promise
        job.resolve(new Float32Array(resultData));
        
        // Clean up
        this.activeJobs.delete(jobId);
        this.completedJobs++;
        
        // Report progress
        this.reportProgress();
        
        // Process next job if available
        this.processNextJob();
    }

    /**
     * Handle job error
     */
    handleJobError(worker, jobId, error) {
        const job = this.activeJobs.get(jobId);
        if (!job) {
            console.warn(`🎯 WORKER ${worker.workerId}: Error for unknown job ${jobId}`);
            return;
        }
        
        console.error(`🎯 WORKER ${worker.workerId}: Error processing chunk ${job.chunkIndex}:`, error);
        
        job.retryCount++;
        
        // Retry if under limit
        if (job.retryCount <= this.maxRetries) {
            console.log(`🎯 WORKER ${worker.workerId}: Retrying chunk ${job.chunkIndex} (attempt ${job.retryCount})`);
            
            // Release worker and retry job
            this.releaseWorker(worker);
            
            // Add delay before retry
            setTimeout(() => {
                this.assignJobToWorker(job);
            }, 100 * job.retryCount);
            
        } else {
            console.error(`🎯 WORKER ${worker.workerId}: Max retries exceeded for chunk ${job.chunkIndex}`);
            
            // Release worker
            this.releaseWorker(worker);
            
            // Reject job
            job.reject(new Error(`Worker processing failed after ${this.maxRetries} retries: ${error}`));
            
            // Clean up
            this.activeJobs.delete(jobId);
        }
    }

    /**
     * Release worker back to available pool
     */
    releaseWorker(worker) {
        worker.isAvailable = true;
        worker.currentJob = null;
        this.busyWorkers.delete(worker);
        this.workerJobs.delete(worker.workerId);
        this.availableWorkers.push(worker);
    }

    /**
     * Process next job in queue
     */
    processNextJob() {
        if (this.jobQueue.length > 0 && this.availableWorkers.length > 0) {
            const nextJob = this.jobQueue.shift();
            this.assignJobToWorker(nextJob);
        }
    }

    /**
     * Report progress to callback
     */
    reportProgress() {
        if (this.progressCallback) {
            const avgTime = this.completionTimes.length > 0 
                ? this.completionTimes.reduce((a, b) => a + b) / this.completionTimes.length 
                : 0;
            
            this.progressCallback({
                type: 'workerProgress',
                activeWorkers: this.busyWorkers.size,
                completedJobs: this.completedJobs,
                totalJobs: this.totalJobs,
                averageProcessingTime: avgTime,
                queueLength: this.jobQueue.length
            });
        }
    }

    /**
     * Handle worker errors
     */
    handleWorkerError(worker, error) {
        console.error(`🎯 WORKER ${worker.workerId}: Worker error:`, error);
        
        // Track errors
        const errorCount = (this.workerErrors.get(worker.workerId) || 0) + 1;
        this.workerErrors.set(worker.workerId, errorCount);
        
        // If worker has current job, handle it as job error
        if (worker.currentJob) {
            this.handleJobError(worker, worker.currentJob.id, error.message || 'Worker error');
        }
        
        // If too many errors, remove worker from pool
        if (errorCount > 3) {
            console.error(`🎯 WORKER ${worker.workerId}: Too many errors, removing from pool`);
            this.removeWorker(worker);
        }
    }

    /**
     * Remove worker from pool
     */
    removeWorker(worker) {
        const workerIndex = this.workers.indexOf(worker);
        if (workerIndex >= 0) {
            this.workers.splice(workerIndex, 1);
        }
        
        const availableIndex = this.availableWorkers.indexOf(worker);
        if (availableIndex >= 0) {
            this.availableWorkers.splice(availableIndex, 1);
        }
        
        this.busyWorkers.delete(worker);
        this.workerJobs.delete(worker.workerId);
        
        worker.terminate();
        
        console.log(`🎯 WORKER POOL: Removed worker ${worker.workerId}, ${this.workers.length} workers remaining`);
    }

    /**
     * Set progress callback
     */
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    /**
     * Check if workers are available and initialized
     */
    isAvailable() {
        return this.isInitialized && this.workers.length > 0;
    }

    /**
     * Get pool status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            totalWorkers: this.workers.length,
            availableWorkers: this.availableWorkers.length,
            busyWorkers: this.busyWorkers.size,
            queuedJobs: this.jobQueue.length,
            activeJobs: this.activeJobs.size
        };
    }

    /**
     * Terminate all workers
     */
    terminate() {
        console.log('🎯 WORKER POOL: Terminating all workers...');
        
        // Reject all pending jobs
        for (const job of this.activeJobs.values()) {
            job.reject(new Error('Worker pool terminated'));
        }
        
        for (const job of this.jobQueue) {
            job.reject(new Error('Worker pool terminated'));
        }
        
        // Terminate all workers
        for (const worker of this.workers) {
            worker.terminate();
        }
        
        // Clear all collections
        this.workers.length = 0;
        this.availableWorkers.length = 0;
        this.busyWorkers.clear();
        this.workerJobs.clear();
        this.activeJobs.clear();
        this.jobQueue.length = 0;
        
        this.isInitialized = false;
        
        console.log('🎯 WORKER POOL: All workers terminated');
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkerPool;
} 