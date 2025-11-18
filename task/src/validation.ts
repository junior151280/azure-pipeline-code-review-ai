export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class InputValidator {
  static validateApiKey(apiKey: string | undefined): ValidationResult {
    const errors: string[] = [];

    if (!apiKey) {
      errors.push('API Key is required');
    } else if (apiKey.length < 10) {
      errors.push('API Key appears to be invalid (too short)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateEndpoint(endpoint: string | undefined): ValidationResult {
    const errors: string[] = [];

    if (!endpoint) {
      errors.push('Azure OpenAI Endpoint is required');
    } else {
      try {
        new URL(endpoint);
        // Accept both old and new Azure OpenAI endpoint formats:
        // Old: https://<resource>.openai.azure.com/...
        // New: https://<admin-resource>.<region>.cognitiveservices.azure.com/openai/...
        // Also: OpenAI direct API
        const isAzureOpenAI = endpoint.includes('openai.azure.com') || 
                              endpoint.includes('cognitiveservices.azure.com');
        const isOpenAI = endpoint.includes('api.openai.com');
        
        if (!isAzureOpenAI && !isOpenAI) {
          errors.push('Endpoint should be a valid Azure OpenAI or OpenAI endpoint URL');
        }
      } catch {
        errors.push('Endpoint must be a valid URL');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateTemperature(temperature: string | undefined): { value: number; errors: string[] } {
    const errors: string[] = [];
    let value = 0;

    if (!temperature || temperature === '') {
      value = 0;
      errors.push('Temperature not provided, defaulting to 0');
    } else {
      const parsed = parseFloat(temperature);
      if (isNaN(parsed)) {
        value = 0;
        errors.push('Temperature must be a number, defaulting to 0');
      } else if (parsed < 0 || parsed > 2) {
        value = Math.max(0, Math.min(2, parsed));
        errors.push(`Temperature must be between 0 and 2, clamping to ${value}`);
      } else {
        value = parsed;
      }
    }

    return { value, errors };
  }

  static validateMaxTokens(maxTokens: string | undefined): { value: number; errors: string[] } {
    const errors: string[] = [];
    let value = 100;

    if (!maxTokens || maxTokens === '') {
      errors.push('Max tokens not provided, defaulting to 100');
    } else {
      const parsed = parseInt(maxTokens, 10);
      if (isNaN(parsed)) {
        errors.push('Max tokens must be a number, defaulting to 100');
      } else if (parsed < 1) {
        value = 100;
        errors.push('Max tokens must be at least 1, defaulting to 100');
      } else if (parsed > 128000) {
        value = 128000;
        errors.push('Max tokens exceeds maximum (128000), clamping to 128000');
      } else {
        value = parsed;
      }
    }

    return { value, errors };
  }

  static validateModel(model: string | undefined): string {
    if (!model || model === '') {
      return 'gpt-4.1-jailtons'; // Default to latest stable model
    }
    return model;
  }
}
