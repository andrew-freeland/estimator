// @module: maps_mcp
// Google Maps MCP tool for Estimator Assistant
// Provides travel distance, time, and location-based cost modifiers

import "server-only";
import { Tool } from "ai";
import logger from "lib/logger";

// EA_ prefix for Estimator Assistant
const EA_GOOGLE_MAPS_API_KEY = process.env.EA_GOOGLE_MAPS_API_KEY;
const EA_GOOGLE_MAPS_BASE_URL = "https://maps.googleapis.com/maps/api";

if (!EA_GOOGLE_MAPS_API_KEY) {
  logger.warn("EA_GOOGLE_MAPS_API_KEY not set - Maps tools will be disabled");
}

// Types for Google Maps API responses
interface DistanceMatrixResponse {
  destination_addresses: string[];
  origin_addresses: string[];
  rows: Array<{
    elements: Array<{
      distance: { text: string; value: number };
      duration: { text: string; value: number };
      status: string;
    }>;
  }>;
  status: string;
}

interface GeocodingResponse {
  results: Array<{
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
      location_type: string;
    };
    place_id: string;
  }>;
  status: string;
}

interface PlaceDetailsResponse {
  result: {
    name: string;
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    place_id: string;
    types: string[];
    business_status?: string;
    rating?: number;
    user_ratings_total?: number;
  };
  status: string;
}

// Helper function to make Google Maps API requests
async function makeMapsRequest(
  endpoint: string,
  params: Record<string, string>,
) {
  if (!EA_GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Maps API key not configured");
  }

  const url = new URL(`${EA_GOOGLE_MAPS_BASE_URL}${endpoint}`);
  Object.entries({ ...params, key: EA_GOOGLE_MAPS_API_KEY }).forEach(
    ([key, value]) => {
      url.searchParams.append(key, value);
    },
  );

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `Google Maps API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

// Tool: Calculate travel distance and time
export const calculateTravelDistanceTool: Tool = {
  description:
    "Calculate travel distance and time between locations for cost estimation",
  inputSchema: {
    origins: {
      type: "array",
      items: { type: "string" },
      description: "Array of origin addresses or coordinates",
    },
    destinations: {
      type: "array",
      items: { type: "string" },
      description: "Array of destination addresses or coordinates",
    },
    mode: {
      type: "string",
      enum: ["driving", "walking", "bicycling", "transit"],
      description: "Travel mode",
      default: "driving",
    },
    avoid: {
      type: "array",
      items: { type: "string" },
      description: "Route restrictions (tolls, highways, ferries, indoor)",
    },
    departureTime: {
      type: "string",
      description:
        "Departure time in seconds since epoch (for traffic-aware routing)",
    },
  },
  execute: async (
    { origins, destinations, mode = "driving", avoid, departureTime },
    _options?: any,
  ) => {
    try {
      logger.info(
        `Calculating travel distance from ${origins.join(", ")} to ${destinations.join(", ")}`,
      );

      const params: Record<string, string> = {
        origins: origins.join("|"),
        destinations: destinations.join("|"),
        mode,
        units: "metric",
      };

      if (avoid && avoid.length > 0) {
        params.avoid = avoid.join("|");
      }

      if (departureTime) {
        params.departure_time = departureTime;
      }

      const response = (await makeMapsRequest(
        "/distancematrix/json",
        params,
      )) as DistanceMatrixResponse;

      if (response.status !== "OK") {
        throw new Error(`Distance Matrix API error: ${response.status}`);
      }

      // Process results
      const results = response.rows
        .map((row, originIndex) =>
          row.elements.map((element, destIndex) => ({
            origin: response.origin_addresses[originIndex],
            destination: response.destination_addresses[destIndex],
            distance: element.distance,
            duration: element.duration,
            status: element.status,
          })),
        )
        .flat();

      // Calculate cost estimates based on distance and time
      const costEstimates = results.map((result) => {
        if (result.status !== "OK") {
          return { ...result, costEstimate: null };
        }

        const distanceKm = result.distance.value / 1000;
        const durationHours = result.duration.value / 3600;

        // Basic cost calculation (can be customized based on business needs)
        const fuelCost = distanceKm * 0.15; // $0.15 per km
        const laborCost = durationHours * 25; // $25 per hour
        const totalCost = fuelCost + laborCost;

        return {
          ...result,
          costEstimate: {
            fuelCost,
            laborCost,
            totalCost,
            distanceKm,
            durationHours,
          },
        };
      });

      return {
        success: true,
        data: {
          results: costEstimates,
          summary: {
            totalOrigins: origins.length,
            totalDestinations: destinations.length,
            successfulRoutes: costEstimates.filter((r) => r.status === "OK")
              .length,
            averageDistance:
              costEstimates
                .filter((r) => r.status === "OK")
                .reduce((sum, r) => sum + r.distance.value / 1000, 0) /
              costEstimates.filter((r) => r.status === "OK").length,
            averageDuration:
              costEstimates
                .filter((r) => r.status === "OK")
                .reduce((sum, r) => sum + r.duration.value / 3600, 0) /
              costEstimates.filter((r) => r.status === "OK").length,
          },
        },
      };
    } catch (error) {
      logger.error("Error calculating travel distance:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

// Tool: Geocode addresses
export const geocodeAddressTool: Tool = {
  description: "Convert addresses to coordinates and get location details",
  inputSchema: {
    address: {
      type: "string",
      description: "Address to geocode",
    },
    region: {
      type: "string",
      description: "Region code to bias results (e.g., 'us', 'ca')",
    },
  },
  execute: async ({ address, region }, _options?: any) => {
    try {
      logger.info(`Geocoding address: ${address}`);

      const params: Record<string, string> = {
        address,
      };

      if (region) {
        params.region = region;
      }

      const response = (await makeMapsRequest(
        "/geocode/json",
        params,
      )) as GeocodingResponse;

      if (response.status !== "OK") {
        throw new Error(`Geocoding API error: ${response.status}`);
      }

      const results = response.results.map((result) => ({
        formattedAddress: result.formatted_address,
        coordinates: result.geometry.location,
        placeId: result.place_id,
        addressComponents: result.address_components.map((component) => ({
          longName: component.long_name,
          shortName: component.short_name,
          types: component.types,
        })),
        locationType: result.geometry.location_type,
      }));

      return {
        success: true,
        data: {
          results,
          count: results.length,
          originalAddress: address,
        },
      };
    } catch (error) {
      logger.error(`Error geocoding address ${address}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

// Tool: Get place details
export const getPlaceDetailsTool: Tool = {
  description: "Get detailed information about a place using its place ID",
  inputSchema: {
    placeId: {
      type: "string",
      description: "Google Places place ID",
    },
    fields: {
      type: "array",
      items: { type: "string" },
      description: "Fields to return (name, rating, geometry, etc.)",
      default: ["name", "formatted_address", "geometry", "place_id", "types"],
    },
  },
  execute: async (
    {
      placeId,
      fields = ["name", "formatted_address", "geometry", "place_id", "types"],
    },
    _options?: any,
  ) => {
    try {
      logger.info(`Getting place details for: ${placeId}`);

      const params: Record<string, string> = {
        place_id: placeId,
        fields: fields.join(","),
      };

      const response = (await makeMapsRequest(
        "/place/details/json",
        params,
      )) as PlaceDetailsResponse;

      if (response.status !== "OK") {
        throw new Error(`Place Details API error: ${response.status}`);
      }

      const place = {
        name: response.result.name,
        formattedAddress: response.result.formatted_address,
        coordinates: response.result.geometry.location,
        placeId: response.result.place_id,
        types: response.result.types,
        businessStatus: response.result.business_status,
        rating: response.result.rating,
        userRatingsTotal: response.result.user_ratings_total,
      };

      return {
        success: true,
        data: {
          place,
        },
      };
    } catch (error) {
      logger.error(`Error getting place details for ${placeId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

// Tool: Calculate location-based cost modifiers
export const calculateLocationCostModifiersTool: Tool = {
  description:
    "Calculate cost modifiers based on location (urban vs rural, cost of living, etc.)",
  inputSchema: {
    address: {
      type: "string",
      description: "Address to analyze for cost modifiers",
    },
    baseCost: {
      type: "number",
      description: "Base cost to apply modifiers to",
    },
  },
  execute: async ({ address, baseCost }, options?: any) => {
    try {
      logger.info(`Calculating location cost modifiers for: ${address}`);

      // First geocode the address
      const geocodeResult = await geocodeAddressTool.execute?.(
        { address },
        options,
      );

      if (!geocodeResult.success) {
        return geocodeResult;
      }

      const location = geocodeResult.data.results[0];
      const { coordinates, addressComponents } = location;

      // Determine location type and cost modifiers
      const modifiers = {
        urbanRural: 1.0,
        costOfLiving: 1.0,
        accessibility: 1.0,
        total: 1.0,
      };

      // Check if it's an urban area (simplified logic)
      const isUrban = addressComponents.some(
        (component) =>
          component.types.includes("locality") ||
          component.types.includes("administrative_area_level_1"),
      );

      if (isUrban) {
        modifiers.urbanRural = 1.2; // 20% higher in urban areas
        modifiers.accessibility = 0.9; // Better accessibility
      } else {
        modifiers.urbanRural = 0.8; // 20% lower in rural areas
        modifiers.accessibility = 1.3; // Higher travel costs
      }

      // Check for high-cost regions (simplified)
      const highCostStates = ["CA", "NY", "MA", "CT", "NJ", "HI", "AK"];
      const state = addressComponents.find((component) =>
        component.types.includes("administrative_area_level_1"),
      );

      if (state && highCostStates.includes(state.short_name)) {
        modifiers.costOfLiving = 1.3; // 30% higher in high-cost states
      }

      // Calculate total modifier
      modifiers.total =
        modifiers.urbanRural * modifiers.costOfLiving * modifiers.accessibility;

      const result = {
        address,
        coordinates,
        modifiers,
        adjustedCost: baseCost ? baseCost * modifiers.total : null,
        locationType: isUrban ? "urban" : "rural",
        state: state?.long_name,
      };

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error(
        `Error calculating location cost modifiers for ${address}:`,
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
};

// Export all Maps tools
export const mapsTools = {
  calculateTravelDistance: calculateTravelDistanceTool,
  geocodeAddress: geocodeAddressTool,
  getPlaceDetails: getPlaceDetailsTool,
  calculateLocationCostModifiers: calculateLocationCostModifiersTool,
};
