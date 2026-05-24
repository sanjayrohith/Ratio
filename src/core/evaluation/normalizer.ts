/**
 * Text normalizer, word stemmer, and pluralization tolerance engine for Ratio evaluation.
 * Performs deterministic text transformations without external heavy NLP libraries.
 */

// Known technical terms and English words ending in 's' that should not be stripped of 's'
const PLURAL_EXCEPTIONS = new Set<string>([
  'redis',
  'tls',
  'https',
  'http',
  'cors',
  'express',
  'status',
  'bypass',
  'pass',
  'class',
  'process',
  'postgres',
  'lens',
  'canvas',
  'bus',
  'chaos',
  'dns',
  'os',
  'as',
  'is',
  'this',
  'less',
  'always',
  'cross',
  'loss',
  'access',
  'address',
  'stress',
]);

/**
 * TextNormalizer handles lowercase conversion, punctuation stripping,
 * word singularization, and lightweight suffix stemming for technical terms.
 */
export class TextNormalizer {
  /**
   * Normalizes raw text: lowercases, replaces punctuation with whitespace, collapses spaces.
   */
  public normalize(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/['’]/g, '') // strip apostrophes for contractions (e.g. don't -> dont)
      .replace(/[-.,!?;:"()[\]{}`\\/<>@#$%^&*~+=_|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }


  /**
   * Splits normalized text into individual words/tokens.
   */
  public tokenize(text: string): string[] {
    const norm = this.normalize(text);
    if (!norm) return [];
    return norm.split(' ').filter((t) => t.length > 0);
  }

  /**
   * Converts common English plural nouns to singular form with technical domain exceptions.
   */
  public singularize(word: string): string {
    const w = word.toLowerCase().trim();
    if (w.length <= 2 || PLURAL_EXCEPTIONS.has(w)) {
      return w;
    }

    // -ies -> -y (dependencies -> dependency, queries -> query, retries -> retry)
    if (w.endsWith('ies') && w.length > 4) {
      return w.slice(0, -3) + 'y';
    }

    // -sses, -shes, -ches, -xes, -zes -> drop -es (bypasses -> bypass, batches -> batch, indexes -> index)
    if (
      w.endsWith('sses') ||
      w.endsWith('shes') ||
      w.endsWith('ches') ||
      w.endsWith('xes') ||
      w.endsWith('zes')
    ) {
      return w.slice(0, -2);
    }

    // -es after other consonants if word > 4 letters (e.g. indices -> index, but handles generic -es)
    if (w.endsWith('ses') && !w.endsWith('sses')) {
      return w.slice(0, -2);
    }

    // Standard -s (tokens -> token, headers -> header, keys -> key)
    if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) {
      return w.slice(0, -1);
    }

    return w;
  }

  /**
   * Stems a single word using lightweight technical suffix rules.
   */
  public stem(word: string): string {
    let w = this.singularize(word);

    if (w.length <= 3 || PLURAL_EXCEPTIONS.has(w)) {
      return w;
    }

    // -ized / -ize (parameterized -> parameter, serialize -> serial)
    if (w.endsWith('ized') && w.length > 6) {
      return w.slice(0, -4);
    }
    if (w.endsWith('ize') && w.length > 5) {
      return w.slice(0, -3);
    }

    // -able / -ible (repeatable -> repeat)
    if ((w.endsWith('able') || w.endsWith('ible')) && w.length > 5) {
      return w.slice(0, -4);
    }

    // -ation / -ition / -tion (invalidation -> invalidat, mutation -> mutat, isolation -> isolat)
    if (w.endsWith('ation') && w.length > 6) {
      return w.slice(0, -3);
    }
    if (w.endsWith('ition') && w.length > 6) {
      return w.slice(0, -3);
    }
    if (w.endsWith('tion') && w.length > 5) {
      return w.slice(0, -3);
    }

    // -ing (locking -> lock, caching -> cach, signing -> sign, pooling -> pool)
    if (w.endsWith('ing') && w.length > 4) {
      const base = w.slice(0, -3);
      // Double consonant reduction (e.g. dropping -> drop)
      if (
        base.length >= 3 &&
        base[base.length - 1] === base[base.length - 2] &&
        !['s', 'l'].includes(base[base.length - 1])
      ) {
        return base.slice(0, -1);
      }
      return base;
    }

    // -ed (locked -> lock, cached -> cach, signed -> sign, rendered -> render)
    if (w.endsWith('ed') && w.length > 4) {
      const base = w.slice(0, -2);
      if (
        base.length >= 3 &&
        base[base.length - 1] === base[base.length - 2] &&
        !['s', 'l'].includes(base[base.length - 1])
      ) {
        return base.slice(0, -1);
      }
      return base;
    }

    // Trailing -e on longer words (cache -> cach, mutate -> mutat, isolate -> isolat)
    if (w.endsWith('e') && !w.endsWith('ee') && w.length > 4) {
      return w.slice(0, -1);
    }

    return w;
  }

  /**
   * Tokenizes and stems each token in the given text.
   */
  public stemTokens(text: string): string[] {
    const tokens = this.tokenize(text);
    return tokens.map((t) => this.stem(t));
  }

  /**
   * Tokenizes and singularizes each token in the given text.
   */
  public singularizeTokens(text: string): string[] {
    const tokens = this.tokenize(text);
    return tokens.map((t) => this.singularize(t));
  }

  /**
   * Checks whether pattern matches text with fuzzy token tolerance:
   * 1. Exact raw text inclusion.
   * 2. Singularized exact or token sequence match.
   * 3. Stemmed token sequence match.
   */
  public fuzzyTokenMatch(pattern: string, text: string): boolean {
    if (!pattern || !text) return false;

    const patternLower = pattern.toLowerCase().trim();
    const textLower = text.toLowerCase().trim();

    // 1. Direct raw match
    if (textLower.includes(patternLower)) {
      return true;
    }

    // 2. Normalized string comparison
    const normPattern = this.normalize(pattern);
    const normText = this.normalize(text);
    if (normText.includes(normPattern)) {
      return true;
    }

    const patternTokens = this.tokenize(pattern);
    if (patternTokens.length === 0) return false;

    const textTokens = this.tokenize(text);
    if (textTokens.length === 0) return false;

    // 3. Singularized token matching
    const singularTextTokens = textTokens.map((t) => this.singularize(t));
    const singularPatternTokens = patternTokens.map((t) => this.singularize(t));

    if (this.containsSubsequence(singularTextTokens, singularPatternTokens)) {
      return true;
    }

    // 4. Stemmed token matching
    const stemmedTextTokens = textTokens.map((t) => this.stem(t));
    const stemmedPatternTokens = patternTokens.map((t) => this.stem(t));

    if (this.containsSubsequence(stemmedTextTokens, stemmedPatternTokens)) {
      return true;
    }

    return false;
  }

  /**
   * Helper to check if a sequence of tokens appears contiguously in haystack.
   */
  private containsSubsequence(haystack: string[], needle: string[]): boolean {
    if (needle.length === 0 || haystack.length < needle.length) {
      return false;
    }

    for (let i = 0; i <= haystack.length - needle.length; i++) {
      let matched = true;
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) {
          matched = false;
          break;
        }
      }
      if (matched) return true;
    }

    return false;
  }
}

export const defaultTextNormalizer = new TextNormalizer();
