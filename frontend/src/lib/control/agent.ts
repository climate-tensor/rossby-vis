/**
 * @fileoverview
 * Asynchronous Agent Implementation - Phase 1.2 Implementation
 * 
 * This module implements the Agent pattern, reproducing the newAgent functionality
 * from the original micro.js with modern TypeScript and automatic cancellation.
 */

/**
 * Agent task function type
 */
export type AgentTask<TResult, TInput = any> = (input: TInput) => Promise<TResult>;

/**
 * Agent event types
 */
export type AgentEvent = 'submit' | 'update' | 'resolve' | 'reject' | 'cancel';

/**
 * Agent event listener
 */
export type AgentEventListener<T = any> = (data?: T) => void;

/**
 * Agent options for configuration
 */
export interface AgentOptions<TResult, TInput> {
    task: AgentTask<TResult, TInput>;
}

/**
 * Agent class
 * Reproduces the newAgent pattern from the original micro.js with TypeScript safety
 * 
 * Key features:
 * - Automatic cancellation of previous tasks when new ones are submitted
 * - Event emission for task lifecycle (submit, update, resolve, reject, cancel)
 * - Type-safe task execution
 */
export class Agent<TResult, TInput = any> {
    private task: AgentTask<TResult, TInput>;
    private currentController: AbortController | null = null;
    private eventListeners = new Map<AgentEvent, Set<AgentEventListener>>();

    constructor(options: AgentOptions<TResult, TInput>) {
        this.task = options.task;
    }

    /**
     * Submit a new task for execution
     * Automatically cancels any currently running task
     */
    async submit(input: TInput): Promise<TResult> {
        // Cancel any existing task
        this.cancel();

        // Create new abort controller for this task
        this.currentController = new AbortController();
        const controller = this.currentController;

        // Emit submit event
        this.emit('submit', input);

        try {
            // Execute the task
            const result = await this.task(input);

            // Check if task was cancelled during execution
            if (controller.signal.aborted) {
                throw new Error('Task was cancelled');
            }

            // Clear current controller and emit resolve event
            this.currentController = null;
            this.emit('resolve', result);
            
            return result;
        } catch (error) {
            // Clear current controller
            this.currentController = null;

            // Emit appropriate event
            if (controller.signal.aborted) {
                this.emit('cancel', error);
            } else {
                this.emit('reject', error);
            }

            throw error;
        }
    }

    /**
     * Cancel the currently running task
     */
    cancel(): void {
        if (this.currentController) {
            this.currentController.abort();
            this.currentController = null;
            this.emit('cancel');
        }
    }

    /**
     * Check if agent is currently executing a task
     */
    isActive(): boolean {
        return this.currentController !== null;
    }

    /**
     * Add event listener
     */
    on(event: AgentEvent, listener: AgentEventListener): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event)!.add(listener);
    }

    /**
     * Remove event listener
     */
    off(event: AgentEvent, listener: AgentEventListener): void {
        this.eventListeners.get(event)?.delete(listener);
    }

    /**
     * Emit event to all listeners
     */
    private emit(event: AgentEvent, data?: any): void {
        this.eventListeners.get(event)?.forEach(listener => {
            try {
                listener(data);
            } catch (error) {
                console.error(`Error in agent event listener for ${event}:`, error);
            }
        });
    }

    /**
     * Clean up the agent and cancel any running tasks
     */
    destroy(): void {
        this.cancel();
        this.eventListeners.clear();
    }
}

/**
 * Factory function for creating agents
 * Maintains compatibility with the original newAgent pattern
 */
export function createAgent<TResult, TInput = any>(
    task: AgentTask<TResult, TInput>
): Agent<TResult, TInput> {
    return new Agent({ task });
}
