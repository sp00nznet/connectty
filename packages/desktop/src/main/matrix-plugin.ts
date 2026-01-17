/**
 * Matrix Plugin - Visual cmatrix-like effect for the plugin panel
 * Displays falling green characters in Matrix style
 */

export interface MatrixConfig {
  speed: number;        // Animation speed (1-10, default: 5)
  density: number;      // Character density (1-10, default: 5)
  fontSize: number;     // Font size in pixels (default: 14)
  color: string;        // Color of characters (default: '#0F0')
  useJapanese: boolean; // Use Japanese katakana characters (default: true)
}

export class MatrixPluginService {
  private defaultConfig: MatrixConfig = {
    speed: 5,
    density: 5,
    fontSize: 14,
    color: '#0F0',
    useJapanese: true,
  };

  /**
   * Get default Matrix configuration
   */
  getDefaultConfig(): MatrixConfig {
    return { ...this.defaultConfig };
  }

  /**
   * Validate and normalize Matrix configuration
   */
  validateConfig(config: Partial<MatrixConfig>): MatrixConfig {
    return {
      speed: Math.max(1, Math.min(10, config.speed ?? this.defaultConfig.speed)),
      density: Math.max(1, Math.min(10, config.density ?? this.defaultConfig.density)),
      fontSize: Math.max(8, Math.min(32, config.fontSize ?? this.defaultConfig.fontSize)),
      color: config.color ?? this.defaultConfig.color,
      useJapanese: config.useJapanese ?? this.defaultConfig.useJapanese,
    };
  }

  /**
   * Get character set for Matrix effect
   */
  getCharacterSet(useJapanese: boolean): string {
    if (useJapanese) {
      // Japanese katakana characters (used in original Matrix)
      return 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    } else {
      // ASCII characters
      return '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+-=[]{}|;:,.<>?';
    }
  }
}
