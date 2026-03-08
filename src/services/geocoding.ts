import { logger } from '../lib/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ===== TYPES =====

export interface GeocodingResult {
  lat: number;
  lng: number;
  place_name: string;
}

export interface AddressInput {
  address_line1?: string;
  postal_code?: string;
  city?: string;
  country?: string;
}

// ===== CACHE =====

const CACHE_KEY = 'geocoding_cache';
const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheEntry {
  result: GeocodingResult;
  timestamp: number;
}

interface CacheStore {
  [addressText: string]: CacheEntry;
}

let inMemoryCache: CacheStore = {};

/**
 * Load cache from AsyncStorage on app start
 */
async function loadCache(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheStore;
      // Filter out expired entries
      const now = Date.now();
      inMemoryCache = Object.entries(parsed).reduce((acc, [key, entry]) => {
        if (now - entry.timestamp < CACHE_EXPIRY_MS) {
          acc[key] = entry;
        }
        return acc;
      }, {} as CacheStore);
    }
  } catch (err) {
    logger.warn('[geocoding] Failed to load cache:', err);
  }
}

/**
 * Save cache to AsyncStorage
 */
async function saveCache(): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(inMemoryCache));
  } catch (err) {
    logger.warn('[geocoding] Failed to save cache:', err);
  }
}

/**
 * Get cached result if available and not expired
 */
function getCached(addressText: string): GeocodingResult | null {
  const entry = inMemoryCache[addressText];
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > CACHE_EXPIRY_MS) {
    delete inMemoryCache[addressText];
    return null;
  }

  return entry.result;
}

/**
 * Cache a geocoding result
 */
function setCached(addressText: string, result: GeocodingResult): void {
  inMemoryCache[addressText] = {
    result,
    timestamp: Date.now(),
  };
  saveCache(); // Fire and forget
}

// Load cache on module initialization
loadCache();

// ===== RATE LIMITING =====

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1000; // 1 second between requests

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
}

// ===== PUBLIC API =====

/**
 * Build a full address text from address components
 */
export function buildAddressText(input: AddressInput): string {
  const parts: string[] = [];
  if (input.address_line1) parts.push(input.address_line1);
  if (input.postal_code) parts.push(input.postal_code);
  if (input.city) parts.push(input.city);
  if (input.country) parts.push(input.country);
  return parts.join(', ');
}

/**
 * Geocode an address using OpenStreetMap Nominatim
 * Returns null if geocoding fails
 */
export async function geocodeAddress(addressText: string): Promise<GeocodingResult | null> {
  if (!addressText || !addressText.trim()) {
    logger.warn('[geocoding] Empty address text');
    return null;
  }

  // Check cache first
  const cached = getCached(addressText);
  if (cached) {
    logger.log('[geocoding] Cache hit for:', addressText);
    return cached;
  }

  try {
    // Rate limiting
    await waitForRateLimit();

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressText)}&limit=1`;
    logger.log('[geocoding] Requesting:', url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FCN-Fans-App/1.0', // Nominatim requires User-Agent
      },
    });

    if (!response.ok) {
      logger.warn('[geocoding] HTTP error:', response.status);
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      logger.warn('[geocoding] No results for:', addressText);
      return null;
    }

    const first = data[0];
    const result: GeocodingResult = {
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lon),
      place_name: first.display_name || addressText,
    };

    // Cache the result
    setCached(addressText, result);

    logger.log('[geocoding] Success:', result);
    return result;
  } catch (err) {
    logger.error('[geocoding] Error geocoding address:', err);
    return null;
  }
}

/**
 * Geocode venue for fixtures (combines venue name + city)
 */
export async function geocodeVenue(
  venueName: string | null,
  venueCity: string | null,
): Promise<GeocodingResult | null> {
  const parts: string[] = [];
  if (venueName) parts.push(venueName);
  if (venueCity) parts.push(venueCity);
  parts.push('Danmark'); // Assume Denmark

  if (parts.length < 2) {
    logger.warn('[geocoding] Insufficient venue data');
    return null;
  }

  const addressText = parts.join(', ');
  return geocodeAddress(addressText);
}
