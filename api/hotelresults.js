
/*
============================================================
BOKKARA HOTEL RESULTS API
============================================================

Endpoint:
GET /api/hotelresults

MODES

1. HOTEL SEARCH
   GET /api/hotelresults?destination=Miami&checkin=2026-11-22&checkout=2026-11-26&adults=2&rooms=1

2. PROPERTY DETAILS
   GET /api/hotelresults?action=details&property_token=TOKEN&destination=Miami&checkin=2026-11-22&checkout=2026-11-26&adults=2

FEATURES
- SerpApi Google Hotels integration
- Search up to 20 properties
- Dynamic search parameters
- Server-side filters
- Local sorting
- Hotel images
- Pricing
- Guest ratings
- Hotel classification
- Property details
- Property street addresses when provided by SerpApi
- Property amenities
- Property photos
- Coordinates
- No fabricated property addresses
- CORS support
============================================================
*/

const SERPAPI_URL = "https://serpapi.com/search";

const HOTEL_LIMIT = 20;
const MAX_CANDIDATES = 100;

/* ==========================================================
   CORS
========================================================== */

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept"
  );
  res.setHeader("Cache-Control", "no-store");
}

/* ==========================================================
   GENERAL HELPERS
========================================================== */

function firstValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }
  return "";
}

function str(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function num(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === undefined || value === null) return 0;

  const parsed = Number(
    String(value).replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value) {
  return (
    value === true ||
    String(value).toLowerCase() === "true" ||
    String(value) === "1"
  );
}

function list(value) {
  if (Array.isArray(value)) {
    return value.map(str).filter(Boolean);
  }

  if (!value) return [];

  return String(value)
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}

function cleanAddress(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const result = value.trim();

    if (
      !result ||
      ["undefined", "null", "[object Object]"]
        .includes(result.toLowerCase())
    ) {
      return "";
    }

    return result;
  }

  if (typeof value === "object") {
    const formatted = firstValue(
      value.formatted_address,
      value.formattedAddress,
      value.full_address,
      value.fullAddress,
      value.address
    );

    if (formatted && formatted !== value) {
      const result = cleanAddress(formatted);
      if (result) return result;
    }

    const street = firstValue(
      value.street_address,
      value.streetAddress,
      value.street,
      value.address_line1,
      value.address1
    );

    const city = firstValue(
      value.city,
      value.locality
    );

    const region = firstValue(
      value.state,
      value.region
    );

    const postal = firstValue(
      value.postal_code,
      value.zip
    );

    const country = firstValue(
      value.country
    );

    if (!street) return "";

    return [
      street,
      city,
      region,
      postal,
      country
    ].map(str).filter(Boolean).join(", ");
  }

  return "";
}

/* ==========================================================
   ADDRESS EXTRACTION

   IMPORTANT:
   Never use the search destination as the property address.
========================================================== */

function extractAddress(hotel) {
  if (!hotel || typeof hotel !== "object") return "";

  const candidates = [
    hotel.formatted_address,
    hotel.formattedAddress,
    hotel.full_address,
    hotel.fullAddress,
    hotel.street_address,
    hotel.streetAddress,
    hotel.hotel_address,
    hotel.hotelAddress,
    hotel.address,
    hotel.location?.address,
    hotel.location?.formatted_address,
    hotel.property?.address,
    hotel.property?.formatted_address,
    hotel.details?.address,
    hotel.details?.formatted_address
  ];

  for (const candidate of candidates) {
    const address = cleanAddress(candidate);
    if (address) return address;
  }

  return "";
}

/* ==========================================================
   AMENITIES
========================================================== */

function extractAmenities(hotel) {
  let source = firstValue(
    hotel.amenities,
    hotel.hotel_amenities,
    hotel.hotelAmenities,
    hotel.details?.amenities
  );

  if (!source) return [];

  if (!Array.isArray(source)) {
    if (typeof source === "object") {
      source = Object.values(source).flat();
    } else {
      source = String(source).split(",");
    }
  }

  return [...new Set(
    source.map(item => {
      if (typeof item === "string") return item.trim();

      if (item && typeof item === "object") {
        return str(firstValue(
          item.name,
          item.title,
          item.label
        ));
      }

      return "";
    }).filter(Boolean)
  )];
}

/* ==========================================================
   IMAGES
========================================================== */

function extractImages(hotel) {
  const images = [];

  const sources = [
    hotel.images,
    hotel.photos,
    hotel.hotel_images,
    hotel.details?.images
  ];

  for (const source of sources) {
    if (!Array.isArray(source)) continue;

    for (const item of source) {
      const url = typeof item === "string"
        ? item
        : firstValue(
            item?.original_image,
            item?.image,
            item?.url,
            item?.thumbnail,
            item?.large,
            item?.src
          );

      if (
        typeof url === "string" &&
        /^https?:\/\//i.test(url) &&
        !images.includes(url)
      ) {
        images.push(url);
      }
    }
  }

  const thumbnail = firstValue(
    hotel.thumbnail,
    hotel.image,
    hotel.image_url,
    hotel.imageUrl,
    hotel.photo,
    hotel.thumbnail_url
  );

  if (
    typeof thumbnail === "string" &&
    /^https?:\/\//i.test(thumbnail) &&
    !images.includes(thumbnail)
  ) {
    images.unshift(thumbnail);
  }

  return images;
}

/* ==========================================================
   PRICE
========================================================== */

function nightlyPrice(hotel) {
  return num(firstValue(
    hotel.rate_per_night?.extracted_lowest,
    hotel.rate_per_night?.extracted_price,
    hotel.rate_per_night?.amount,
    hotel.extracted_price,
    hotel.price_per_night,
    hotel.pricePerNight,
    hotel.extracted_lowest,
    hotel.rate?.extracted_lowest,
    hotel.price
  ));
}

function totalPrice(hotel) {
  return num(firstValue(
    hotel.total_rate?.extracted_lowest,
    hotel.total_rate?.extracted_price,
    hotel.total_price,
    hotel.totalPrice,
    hotel.extracted_total_price
  ));
}

function extractStars(hotel) {
  return num(firstValue(
    hotel.extracted_hotel_class,
    hotel.hotel_class,
    hotel.stars,
    hotel.star_rating,
    hotel.hotel_star_rating
  ));
}

function extractRating(hotel) {
  return num(firstValue(
    hotel.overall_rating,
    hotel.rating,
    hotel.overallRating,
    hotel.guest_rating
  ));
}

function extractReviews(hotel) {
  return num(firstValue(
    hotel.reviews,
    hotel.review_count,
    hotel.reviewCount,
    hotel.total_reviews,
    hotel.reviews_count
  ));
}

/* ==========================================================
   NORMALIZE HOTEL
========================================================== */

function normalizeHotel(hotel, index = 0) {
  const name = str(firstValue(
    hotel.name,
    hotel.hotel_name,
    hotel.hotelName,
    hotel.property_name,
    hotel.propertyName,
    "Hotel"
  ));

  const address = extractAddress(hotel);
  const images = extractImages(hotel);
  const amenities = extractAmenities(hotel);

  const coordinates = firstValue(
    hotel.gps_coordinates,
    hotel.coordinates,
    hotel.location?.coordinates,
    {}
  );

  const latitude = num(firstValue(
    coordinates.latitude,
    coordinates.lat,
    hotel.latitude,
    hotel.lat
  ));

  const longitude = num(firstValue(
    coordinates.longitude,
    coordinates.lng,
    coordinates.long,
    hotel.longitude,
    hotel.long
  ));

  const propertyToken = str(firstValue(
    hotel.property_token,
    hotel.propertyToken
  ));

  const id = str(firstValue(
    propertyToken,
    hotel.hotel_id,
    hotel.place_id,
    hotel.id,
    `${name}|${address}|${index}`
  ));

  const price = nightlyPrice(hotel);
  const stars = extractStars(hotel);
  const rating = extractRating(hotel);
  const reviews = extractReviews(hotel);

  const cancellation =
    bool(hotel.free_cancellation) ||
    bool(hotel.freeCancellation);

  const breakfast =
    bool(hotel.free_breakfast) ||
    bool(hotel.freeBreakfast) ||
    amenities.some(a =>
      /free breakfast|breakfast included|complimentary breakfast/i
        .test(a)
    );

  return {
    id,
    index,

    property_token: propertyToken,
    hotel_id: str(hotel.hotel_id),
    place_id: str(hotel.place_id),

    name,
    type: str(firstValue(hotel.type, "hotel")),

    description: str(firstValue(
      hotel.description,
      hotel.hotel_description,
      hotel.details?.description
    )),

    address,
    formatted_address: address,

    neighborhood: str(hotel.neighborhood),
    city: str(hotel.city),
    country: str(hotel.country),

    phone: str(firstValue(
      hotel.phone,
      hotel.phone_number,
      hotel.telephone
    )),

    website: str(firstValue(
      hotel.website,
      hotel.link
    )),

    stars,
    hotel_class: stars,

    rating,
    reviews,

    price,
    extracted_price: price,
    price_per_night: price,

    total_price: totalPrice(hotel),

    before_taxes_fees: num(firstValue(
      hotel.rate_per_night?.extracted_before_taxes_fees,
      hotel.extracted_before_taxes_fees
    )),

    currency: str(firstValue(
      hotel.currency,
      hotel.rate_per_night?.currency,
      "USD"
    )),

    images,
    image: images[0] || "",
    thumbnail: images[0] || "",

    amenities,

    free_cancellation: cancellation,
    free_breakfast: breakfast,

    lat: latitude,
    long: longitude,
    latitude,
    longitude,

    checkin_time: str(firstValue(
      hotel.check_in_time,
      hotel.checkin_time
    )),

    checkout_time: str(firstValue(
      hotel.check_out_time,
      hotel.checkout_time
    )),

    booking_url: str(firstValue(
      hotel.booking_url,
      hotel.bookingUrl,
      hotel.link
    )),

    serpapi_property_details_link: str(
      hotel.serpapi_property_details_link
    ),

    sponsored: bool(hotel.sponsored),
    eco_certified: bool(hotel.eco_certified),

    deal: hotel.deal || "",
    deal_description: str(hotel.deal_description),

    nearby_places: hotel.nearby_places || [],
    ratings: hotel.ratings || [],

    raw: hotel
  };
}

/* ==========================================================
   EXTRACT PROPERTY ARRAY
========================================================== */

function extractProperties(data) {
  const candidates = [
    data?.properties,
    data?.hotels,
    data?.results,
    data?.data?.properties,
    data?.data?.hotels,
    data?.data?.results
  ];

  if (Array.isArray(data)) return data;

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

/* ==========================================================
   SEARCH INPUT
========================================================== */

function normalizeQuery(req) {
  const source = req.method === "POST"
    ? (req.body || {})
    : (req.query || {});

  const filters = {
    price_ranges: list(firstValue(
      source.price_ranges,
      source.priceRange
    )),

    stars: list(firstValue(
      source.stars,
      source.hotel_class
    )),

    rating: list(firstValue(
      source.rating,
      source.min_rating
    )),

    amenities: list(firstValue(
      source.amenities,
      source.amenity
    )),

    free_cancellation: bool(firstValue(
      source.free_cancellation,
      source.freeCancellation
    )),

    free_breakfast: bool(firstValue(
      source.free_breakfast,
      source.freeBreakfast
    ))
  };

  return {
    action: str(firstValue(
      source.action,
      source.mode
    )).toLowerCase(),

    destination: str(firstValue(
      source.destination,
      source.q,
      source.location
    )),

    check_in_date: str(firstValue(
      source.checkin,
      source.check_in_date,
      source.checkIn
    )),

    check_out_date: str(firstValue(
      source.checkout,
      source.check_out_date,
      source.checkOut
    )),

    rooms: Math.max(1, num(firstValue(
      source.rooms, 1
    ))),

    adults: Math.max(1, num(firstValue(
      source.adults, 1
    ))),

    children: Math.max(0, num(source.children)),
    babies: Math.max(0, num(source.babies)),
    seniors: Math.max(0, num(source.seniors)),
    guests: Math.max(0, num(source.guests)),

    property_token: str(firstValue(
      source.property_token,
      source.propertyToken
    )),

    limit: Math.min(
      HOTEL_LIMIT,
      Math.max(1, num(firstValue(
        source.limit,
        HOTEL_LIMIT
      )))
    ),

    sort: str(firstValue(
      source.sort,
      "recommended"
    )),

    filters
  };
}

/* ==========================================================
   DATE VALIDATION
========================================================== */

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validateSearch(query) {
  if (!query.destination) {
    throw new Error("Destination is required.");
  }

  if (
    !validDate(query.check_in_date) ||
    !validDate(query.check_out_date)
  ) {
    throw new Error(
      "Valid check-in and check-out dates are required."
    );
  }

  if (query.check_out_date <= query.check_in_date) {
    throw new Error(
      "Check-out must be after check-in."
    );
  }
}

/* ==========================================================
   SERPAPI REQUEST
========================================================== */

async function fetchSerpApi(params) {
  const response = await fetch(
    `${SERPAPI_URL}?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }
  );

  const data = await response.json().catch(() => {
    throw new Error(
      "SerpApi returned an invalid JSON response."
    );
  });

  if (!response.ok || data.error) {
    throw new Error(
      str(firstValue(
        data.error,
        data.message,
        "SerpApi request failed."
      ))
    );
  }

  return data;
}

/* ==========================================================
   BASE SERPAPI PARAMETERS
========================================================== */

function baseParams(query) {
  const params = new URLSearchParams();

  params.set("engine", "google_hotels");
  params.set("api_key", process.env.SERPAPI_API_KEY);

  params.set("q", query.destination);

  params.set(
    "check_in_date",
    query.check_in_date
  );

  params.set(
    "check_out_date",
    query.check_out_date
  );

  params.set("adults", String(query.adults));
  params.set("children", String(query.children));

  params.set("currency", "USD");
  params.set("hl", "en");
  params.set("gl", "us");

  return params;
}

/* ==========================================================
   PRICE FILTERS
========================================================== */

function priceRange(name) {
  switch (str(name).toLowerCase()) {
    case "under100":
      return [0, 99.99];

    case "100-200":
      return [100, 200];

    case "200-300":
      return [200.01, 300];

    case "300plus":
      return [300.01, Infinity];

    default:
      return null;
  }
}

/* ==========================================================
   FILTER VERIFICATION
========================================================== */

function hotelMatchesFilters(hotel, filters) {
  if (filters.price_ranges.length) {
    const matches = filters.price_ranges.some(value => {
      const range = priceRange(value);

      return range &&
        hotel.price >= range[0] &&
        hotel.price <= range[1];
    });

    if (!matches) return false;
  }

  if (filters.stars.length) {
    const minimum = Math.min(
      ...filters.stars.map(num)
    );

    if (hotel.stars < minimum) return false;
  }

  if (filters.rating.length) {
    const minimum = Math.min(
      ...filters.rating.map(num)
    );

    if (hotel.rating < minimum) return false;
  }

  if (filters.amenities.length) {
    const names = hotel.amenities.map(a =>
      str(a).toLowerCase()
    );

    const matches = filters.amenities.every(requested => {
      if (/^\d+$/.test(requested)) return true;

      const normalized = requested
        .toLowerCase()
        .replace(/[_-]/g, " ");

      return names.some(name =>
        name.includes(normalized) ||
        normalized.includes(name)
      );
    });

    if (!matches) return false;
  }

  if (
    filters.free_cancellation &&
    !hotel.free_cancellation
  ) {
    return false;
  }

  if (
    filters.free_breakfast &&
    !hotel.free_breakfast
  ) {
    return false;
  }

  return true;
}

/* ==========================================================
   SORTING
========================================================== */

function sortHotels(hotels, sort) {
  const result = hotels.slice();

  switch (sort) {
    case "price-low":
      result.sort((a, b) => a.price - b.price);
      break;

    case "price-high":
      result.sort((a, b) => b.price - a.price);
      break;

    case "rating":
      result.sort((a, b) => b.rating - a.rating);
      break;

    case "stars":
      result.sort((a, b) => b.stars - a.stars);
      break;

    case "reviews":
      result.sort((a, b) => b.reviews - a.reviews);
      break;

    default:
      result.sort((a, b) =>
        b.rating - a.rating ||
        b.reviews - a.reviews ||
        a.price - b.price
      );
  }

  return result;
}

/* ==========================================================
   SEARCH HOTELS
========================================================== */

async function searchHotels(query) {
  validateSearch(query);

  const params = baseParams(query);

  params.set("num", "100");
  params.set("deep_search", "true");
  params.set("show_hidden", "true");

  const priceRanges = query.filters.price_ranges
    .map(priceRange)
    .filter(Boolean);

  if (priceRanges.length) {
    const min = Math.min(...priceRanges.map(r => r[0]));
    const max = Math.max(...priceRanges.map(r => r[1]));

    if (min > 0) {
      params.set("min_price", String(Math.ceil(min)));
    }

    if (Number.isFinite(max)) {
      params.set("max_price", String(Math.floor(max)));
    }
  }

  if (query.filters.stars.length) {
    const minStars = Math.min(
      ...query.filters.stars.map(num)
    );

    if (minStars >= 2 && minStars <= 5) {
      const classes = [];

      for (let i = minStars; i <= 5; i++) {
        classes.push(String(i));
      }

      params.set("hotel_class", classes.join(","));
    }
  }

  if (query.filters.rating.length) {
    const rating = Math.min(
      ...query.filters.rating.map(num)
    );

    if (rating >= 7) {
      params.set(
        "rating",
        String(rating >= 9 ? 9 : rating >= 8 ? 8 : 7)
      );
    }
  }

  const numericAmenities = query.filters.amenities
    .filter(value => /^\d+$/.test(value));

  if (numericAmenities.length) {
    params.set(
      "amenities",
      numericAmenities.join(",")
    );
  }

  if (query.filters.free_cancellation) {
    params.set("free_cancellation", "true");
  }

  const data = await fetchSerpApi(params);

  const rawProperties = extractProperties(data)
    .slice(0, MAX_CANDIDATES);

  const normalized = rawProperties.map(
    (hotel, index) => normalizeHotel(hotel, index)
  );

  const usable = normalized.filter(hotel =>
    hotel.price > 0 &&
    hotel.rating > 0 &&
    hotel.images.length > 0
  );

  const seen = new Set();

  const unique = usable.filter(hotel => {
    const key = str(firstValue(
      hotel.property_token,
      hotel.hotel_id,
      hotel.place_id,
      `${hotel.name}|${hotel.address}`
    )).toLowerCase();

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });

  const filtered = unique.filter(hotel =>
    hotelMatchesFilters(hotel, query.filters)
  );

  const sorted = sortHotels(filtered, query.sort);

  const hotels = sorted.slice(0, query.limit);

  return {
    success: true,

    hotels,
    properties: hotels,
    results: hotels,

    search: {
      destination: query.destination,
      check_in_date: query.check_in_date,
      check_out_date: query.check_out_date,
      rooms: query.rooms,
      adults: query.adults,
      children: query.children,
      babies: query.babies,
      seniors: query.seniors,
      guests: query.guests
    },

    filters: query.filters,
    sort: query.sort,

    pagination: {
      next_page_token: null,
      has_more: false
    },

    meta: {
      requested_limit: query.limit,
      raw_properties: rawProperties.length,
      usable_properties: usable.length,
      unique_properties: unique.length,
      filtered_properties: filtered.length,
      returned_properties: hotels.length,
      serpapi_request_count: 1
    }
  };
}

/* ==========================================================
   PROPERTY DETAILS

   Called when customer opens a hotel.

   Uses the property_token from search results.
========================================================== */

async function getPropertyDetails(query) {
  validateSearch(query);

  if (!query.property_token) {
    throw new Error(
      "A property_token is required for hotel details."
    );
  }

  const params = baseParams(query);

  params.set(
    "property_token",
    query.property_token
  );

  const data = await fetchSerpApi(params);

  /*
    Property detail responses may have a different
    structure from ordinary search results.
  */

  const property = firstValue(
    data.property,
    data.hotel,
    data.hotel_details,
    data.property_details,
    data
  );

  const normalized = normalizeHotel(property);

  /*
    Some responses place fields at the top level
    rather than inside a property object.
  */

  const address = firstValue(
    extractAddress(property),
    extractAddress(data)
  );

  const images = [
    ...new Set([
      ...extractImages(property),
      ...extractImages(data)
    ])
  ];

  const amenities = [
    ...new Set([
      ...extractAmenities(property),
      ...extractAmenities(data)
    ])
  ];

  const details = {
    ...normalized,

    property_token: query.property_token,

    address: address || "",
    formatted_address: address || "",

    images,
    image: images[0] || normalized.image,
    thumbnail: images[0] || normalized.thumbnail,

    amenities,

    description: str(firstValue(
      normalized.description,
      data.description,
      data.hotel_description
    )),

    phone: str(firstValue(
      normalized.phone,
      data.phone,
      data.phone_number
    )),

    website: str(firstValue(
      normalized.website,
      data.website
    )),

    nearby_places: firstValue(
      property.nearby_places,
      data.nearby_places,
      []
    ),

    ratings: firstValue(
      property.ratings,
      data.ratings,
      []
    ),

    address_available: Boolean(address),

    raw: data
  };

  return {
    success: true,
    mode: "details",

    hotel: details,
    property: details,
    details,

    address: details.address,
    address_available: details.address_available,

    property_token: query.property_token
  };
}

/* ==========================================================
   MAIN VERCEL HANDLER
========================================================== */

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  if (!process.env.SERPAPI_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "SERPAPI_API_KEY is not configured."
    });
  }

  try {
    const query = normalizeQuery(req);

    if (
      query.action === "details" ||
      query.action === "property_details"
    ) {
      const result = await getPropertyDetails(query);

      return res.status(200).json(result);
    }

    const result = await searchHotels(query);

    return res.status(200).json(result);

  } catch (error) {
    console.error(
      "Bokkara Hotel API Error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: error?.message || "Hotel API request failed."
    });
  }
}
