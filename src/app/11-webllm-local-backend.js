// ==================== WebLLM Local Backend State ====================
// Keep this chunk side-effect light. The WebLLM engine is created only after user confirmation.
let webllmEngine = null;
let webllmCurrentModel = null;

const WEBLLM_MODEL_INFO = {
    'Llama-3.2-1B-Instruct-q4f16_1-MLC': { label: 'Llama-3.2-1B', sizeMB: 850 },
    'Llama-3.2-3B-Instruct-q4f16_1-MLC': { label: 'Llama-3.2-3B', sizeMB: 2100 }
};
