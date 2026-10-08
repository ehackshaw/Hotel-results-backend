
/*
============================================================
BOKKARA — HOTEL RESULTS BACKEND
============================================================

FILE:
api/hotelresults.js

ENDPOINT:
GET /api/hotelresults

FEATURES:
- One SerpApi request per hotel search
- Configurable property limit from 1 to 100
- No additional property details requests
- No pagination
- Property names and classifications
- Actual street addresses when available
- Neighborhood and locality fallback
- Address source and location type
- Hotel images
- Nightly and total stay pricing
- Guest ratings and reviews
- Star classifications
- Amenities
- Free cancellation
- Free breakfast
- GPS coordinates
- Property tokens for future details page
- Optional sorting
- Shopify-compatible JSON response
- CORS support

ENVIRONMENT VARIABLE:
SERPAPI_API_KEY

============================================================
*/

const SERPAPI_ENDPOINT =
  "https://serpapi.com/search.json";

const MAX_HOTELS = 100;

const DEFAULT_HOTELS = 20;


/* ==========================================================
   GENERAL HELPERS
========================================================== */

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function text(value) {
  if (
    value === undefined ||
    value === null ||
    typeof value === "object"
  ) {
    return "";
  }

  return String(value).trim();
}

function number(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "object") {
    return number(
      first(
        value.extracted_lowest,
        value.extracted_price,
        value.amount,
        value.value,
        value.extracted
      )
    );
  }

  const parsed = Number(
    String(value).replace(/[^0-9.-]/g, "")
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function boolean(value) {
  return (
    value === true ||
    value === 1 ||
    String(value).toLowerCase() === "true"
  );
}

function array(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return [];
  }

  return [value];
}

function unique(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    )
  ];
}

function validUrl(value) {
  const result = text(value);

  return /^https?:\/\//i.test(result)
    ? result
    : "";
}

function safeObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : {};
}


/* ==========================================================
   DATE NORMALIZATION
========================================================== */

function normalizeDate(value) {
  const input = text(value);

  if (!input) return "";

  let year;
  let month;
  let day;

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(input)
  ) {
    [year, month, day] =
      input.split("-").map(Number);

  } else if (
    /^\d{2}\/\d{2}\/\d{4}$/.test(input)
  ) {
    [day, month, year] =
      input.split("/").map(Number);

  } else {
    const date = new Date(input);

    if (
      !Number.isFinite(date.getTime())
    ) {
      return "";
    }

    year = date.getUTCFullYear();

    month = date.getUTCMonth() + 1;

    day = date.getUTCDate();
  }

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}


/* ==========================================================
   ADDRESS HELPERS
========================================================== */

function cleanLocation(value) {
  const result = text(value);

  if (!result) return "";

  if (
    /^(undefined|null|nan|\[object object\])$/i
      .test(result)
  ) {
    return "";
  }

  return result.replace(/\s+/g, " ").trim();
}

function cleanAddress(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return cleanLocation(value);
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return "";
  }

  const formatted = first(
    value.formatted_address,
    value.formattedAddress,
    value.full_address,
    value.fullAddress
  );

  if (formatted) {
    const result = cleanAddress(formatted);

    if (result) return result;
  }

  const street = first(
    value.street_address,
    value.streetAddress,
    value.street,
    value.address_line1,
    value.addressLine1,
    value.address1,
    value.line1,
    value.route
  );

  if (street) {
    return unique([
      cleanLocation(street),
      cleanLocation(
        first(
          value.address_line2,
          value.addressLine2
        )
      ),
      cleanLocation(
        first(
          value.city,
          value.locality
        )
      ),
      cleanLocation(
        first(
          value.state,
          value.region
        )
      ),
      cleanLocation(
        first(
          value.postal_code,
          value.postalCode,
          value.zip
        )
      ),
      cleanLocation(value.country)
    ]).join(", ");
  }

  if (
    value.address &&
    value.address !== value
  ) {
    return cleanAddress(value.address);
  }

  return "";
}


/* ==========================================================
   STREET ADDRESS VERIFICATION
========================================================== */

/*
A city, neighborhood or region must not be
represented as a verified street address.

This is a conservative check.

A valid address may sometimes be rejected if
it has an unusual format, but the backend will
never manufacture a street address.
*/

function looksLikeStreetAddress(value) {
  const address = cleanLocation(value);

  if (!address) return false;

  const streetWords =
    /\b(street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|boulevard|blvd\.?|lane|ln\.?|way|court|ct\.?|place|pl\.?|highway|hwy\.?|terrace|ter\.?|circle|cir\.?|parkway|pkwy\.?|square|sq\.?|trail|tr\.?|alley|plaza|paseo|calle|rue|strasse)\b/i;

  const hasNumber =
    /\b\d{1,6}[a-z]?\b/i.test(address);

  const hasStreet =
    streetWords.test(address);

  return hasNumber && hasStreet;
}


/* ==========================================================
   PROPERTY ADDRESS EXTRACTION
========================================================== */

function extractPropertyLocation(
  hotel,
  destination
) {
  const h = safeObject(hotel);

  const nestedLocation =
    safeObject(h.location);

  const nestedProperty =
    safeObject(h.property);

  const nestedDetails =
    safeObject(h.details);

  const candidates = [
    ["formatted_address", h.formatted_address],
    ["formattedAddress", h.formattedAddress],
    ["full_address", h.full_address],
    ["fullAddress", h.fullAddress],
    ["street_address", h.street_address],
    ["streetAddress", h.streetAddress],
    ["hotel_address", h.hotel_address],
    ["hotelAddress", h.hotelAddress],
    ["property_address", h.property_address],
    ["propertyAddress", h.propertyAddress],
    ["address", h.address],
    ["vicinity", h.vicinity],
    ["location.address", nestedLocation.address],
    [
      "location.formatted_address",
      nestedLocation.formatted_address
    ],
    [
      "property.address",
      nestedProperty.address
    ],
    [
      "property.formatted_address",
      nestedProperty.formatted_address
    ],
    [
      "details.address",
      nestedDetails.address
    ],
    [
      "details.formatted_address",
      nestedDetails.formatted_address
    ]
  ];

  let streetAddress = "";
  let addressSource = "";

  let areaLabel = "";
  let areaSource = "";

  const normalizedDestination =
    cleanLocation(destination).toLowerCase();

  for (const [source, value] of candidates) {
    const address = cleanAddress(value);

    if (!address) continue;

    if (
      address.toLowerCase() ===
      normalizedDestination
    ) {
      continue;
    }

    if (
      looksLikeStreetAddress(address)
    ) {
      streetAddress = address;
      addressSource = source;
      break;
    }

    if (!areaLabel) {
      areaLabel = address;
      areaSource = source;
    }
  }

  /*
    Explicit locality fields are preferable
    to guessing a location from coordinates.
  */

  const neighborhood = cleanLocation(
    first(
      h.neighborhood,
      h.district,
      nestedLocation.neighborhood,
      nestedLocation.district
    )
  );

  const city = cleanLocation(
    first(
      h.city,
      h.locality,
      nestedLocation.city,
      nestedLocation.locality
    )
  );

  const region = cleanLocation(
    first(
      h.state,
      h.region,
      nestedLocation.state,
      nestedLocation.region
    )
  );

  const country = cleanLocation(
    first(
      h.country,
      nestedLocation.country
    )
  );

  const locality = unique([
    neighborhood,
    city,
    region,
    country
  ]).join(", ");

  const locationLabel =
    streetAddress ||
    areaLabel ||
    locality ||
    "";

  return {
    address: streetAddress,

    formatted_address: streetAddress,

    address_available:
      Boolean(streetAddress),

    address_source:
      streetAddress
        ? addressSource
        : "",

    location_label:
      locationLabel,

    location_type:
      streetAddress
        ? "street"
        : locationLabel
          ? "area"
          : "unavailable",

    location_source:
      streetAddress
        ? addressSource
        : areaLabel
          ? areaSource
          : locality
            ? "locality_fields"
            : "",

    neighborhood,

    city,

    region,

    country
  };
}


/* ==========================================================
   HOTEL PHOTOS
========================================================== */

function extractPhotos(hotel) {
  const h = safeObject(hotel);

  const sources = [
    h.thumbnail,
    h.image,
    h.image_url,
    h.imageUrl,
    h.main_image,
    h.photo,
    ...array(h.images),
    ...array(h.photos),
    ...array(h.hotel_images),
    ...array(h.hotel_photos)
  ];

  const results = [];

  for (const item of sources) {
    const image = validUrl(
      typeof item === "string"
        ? item
        : first(
            item?.original_image,
            item?.image,
            item?.url,
            item?.thumbnail,
            item?.src,
            item?.large
          )
    );

    if (
      image &&
      !results.includes(image)
    ) {
      results.push(image);
    }
  }

  return results;
}


/* ==========================================================
   HOTEL AMENITIES
========================================================== */

function extractAmenities(hotel) {
  const h = safeObject(hotel);

  const source = first(
    h.amenities,
    h.hotel_amenities,
    h.hotelAmenities,
    h.facilities,
    []
  );

  let values;

  if (Array.isArray(source)) {
    values = source;

  } else if (
    source &&
    typeof source === "object"
  ) {
    values = Object.values(source).flat();

  } else {
    values = String(source || "").split(",");
  }

  return unique(
    values.map(item => {
      if (typeof item === "string") {
        return cleanLocation(item);
      }

      if (
        item &&
        typeof item === "object"
      ) {
        return cleanLocation(
          first(
            item.name,
            item.title,
            item.label
          )
        );
      }

      return "";
    })
  );
}


/* ==========================================================
   HOTEL PRICES
========================================================== */

function extractNightlyPrice(hotel) {
  const h = safeObject(hotel);

  return number(
    first(
      h.rate_per_night?.extracted_lowest,
      h.rate_per_night?.extracted_price,
      h.rate_per_night?.amount,
      h.extracted_price,
      h.price_per_night,
      h.pricePerNight,
      h.rate?.extracted_lowest,
      h.price
    )
  );
}

function extractTotalPrice(hotel) {
  const h = safeObject(hotel);

  return number(
    first(
      h.total_rate?.extracted_lowest,
      h.total_rate?.extracted_price,
      h.total_price,
      h.totalPrice,
      h.extracted_total_price
    )
  );
}


/* ==========================================================
   HOTEL RATINGS
========================================================== */

function extractStars(hotel) {
  const h = safeObject(hotel);

  return number(
    first(
      h.extracted_hotel_class,
      h.hotel_class,
      h.stars,
      h.star_rating,
      h.hotel_star_rating
    )
  );
}

function extractRating(hotel) {
  const h = safeObject(hotel);

  return number(
    first(
      h.overall_rating,
      h.rating,
      h.overallRating,
      h.guest_rating
    )
  );
}

function extractReviews(hotel) {
  const h = safeObject(hotel);

  return number(
    first(
      h.reviews,
      h.review_count,
      h.reviewCount,
      h.total_reviews,
      h.reviews_count
    )
  );
}


/* ==========================================================
   NORMALIZE HOTEL PROPERTY
========================================================== */

function normalizeHotel(
  hotel,
  index,
  query
) {
  const h = safeObject(hotel);

  const name = cleanLocation(
    first(
      h.name,
      h.hotel_name,
      h.hotelName,
      h.property_name,
      h.propertyName
    )
  );

  if (!name) {
    return null;
  }

  const location =
    extractPropertyLocation(
      h,
      query.destination
    );

  const images =
    extractPhotos(h);

  const amenities =
    extractAmenities(h);

  const propertyToken = text(
    first(
      h.property_token,
      h.propertyToken
    )
  );

  const nightlyPrice =
    extractNightlyPrice(h);

  const totalPrice =
    extractTotalPrice(h);

  const stars =
    extractStars(h);

  const rating =
    extractRating(h);

  const reviews =
    extractReviews(h);

  const gps = safeObject(
    first(
      h.gps_coordinates,
      h.coordinates,
      h.location?.coordinates,
      {}
    )
  );

  const latitude = number(
    first(
      gps.latitude,
      gps.lat,
      h.latitude,
      h.lat
    )
  );

  const longitude = number(
    first(
      gps.longitude,
      gps.lng,
      gps.long,
      h.longitude,
      h.long
    )
  );

  const freeCancellation =
    boolean(h.free_cancellation) ||
    boolean(h.freeCancellation);

  const freeBreakfast =
    boolean(h.free_breakfast) ||
    boolean(h.freeBreakfast) ||
    amenities.some(item =>
      /free breakfast|breakfast included|complimentary breakfast/i
        .test(item)
    );

  const id = text(
    first(
      propertyToken,
      h.hotel_id,
      h.place_id,
      h.id,
      `${name}|${index}`
    )
  );

  return {
    id,

    index,

    property_token:
      propertyToken,

    hotel_id:
      text(h.hotel_id),

    place_id:
      text(h.place_id),

    name,

    type: text(
      first(
        h.type,
        "hotel"
      )
    ),

    description: text(
      first(
        h.description,
        h.hotel_description
      )
    ),

    /*
      Property address fields.
    */

    address:
      location.address,

    formatted_address:
      location.formatted_address,

    address_available:
      location.address_available,

    address_source:
      location.address_source,

    /*
      Best available display location.
    */

    location_label:
      location.location_label,

    location_type:
      location.location_type,

    location_source:
      location.location_source,

    neighborhood:
      location.neighborhood,

    city:
      location.city,

    region:
      location.region,

    country:
      location.country,

    /*
      Hotel classification.
    */

    stars,

    hotel_class: stars,

    /*
      Reviews.
    */

    rating,

    reviews,

    review_count: reviews,

    /*
      Prices.
    */

    price:
      nightlyPrice,

    extracted_price:
      nightlyPrice,

    price_per_night:
      nightlyPrice,

    total_price:
      totalPrice,

    before_taxes_fees:
      number(
        first(
          h.rate_per_night
            ?.extracted_before_taxes_fees,
          h.extracted_before_taxes_fees
        )
      ),

    currency:
      query.currency,

    /*
      Images.
    */

    images,

    image:
      images[0] || "",

    thumbnail:
      images[0] || "",

    image_count:
      images.length,

    /*
      Amenities.
    */

    amenities,

    free_cancellation:
      freeCancellation,

    free_breakfast:
      freeBreakfast,

    /*
      GPS coordinates.
    */

    lat:
      latitude,

    long:
      longitude,

    latitude,

    longitude,

    /*
      Offers.
    */

    deal:
      h.deal || "",

    deal_description:
      text(h.deal_description),

    sponsored:
      boolean(h.sponsored),

    eco_certified:
      boolean(h.eco_certified),

    /*
      Future property details page.
    */

    serpapi_property_details_link:
      text(
        h.serpapi_property_details_link
      )
  };
}


/* ==========================================================
   SEARCH PARAMETERS
========================================================== */

function parseSearch(req) {
  const source =
    req.method === "POST"
      ? req.body || {}
      : req.query || {};

  const destination = text(
    first(
      source.destination,
      source.q,
      source.location
    )
  );

  const checkIn = normalizeDate(
    first(
      source.checkin,
      source.check_in_date,
      source.checkIn
    )
  );

  const checkOut = normalizeDate(
    first(
      source.checkout,
      source.check_out_date,
      source.checkOut
    )
  );

  const requestedLimit = number(
    first(
      source.limit,
      source.count,
      source.properties,
      DEFAULT_HOTELS
    )
  );

  const limit = Math.min(
    MAX_HOTELS,
    Math.max(
      1,
      Math.trunc(
        requestedLimit ??
        DEFAULT_HOTELS
      )
    )
  );

  const adults = Math.max(
    1,
    Math.trunc(
      number(
        first(
          source.adults,
          1
        )
      ) ?? 1
    )
  );

  const children = Math.max(
    0,
    Math.trunc(
      number(source.children) ?? 0
    )
  );

  const rooms = Math.max(
    1,
    Math.trunc(
      number(
        first(
          source.rooms,
          1
        )
      ) ?? 1
    )
  );

  const currencyInput =
    text(source.currency).toUpperCase();

  const currency =
    /^[A-Z]{3}$/.test(currencyInput)
      ? currencyInput
      : "USD";

  return {
    destination,

    check_in_date:
      checkIn,

    check_out_date:
      checkOut,

    adults,

    children,

    rooms,

    babies: Math.max(
      0,
      Math.trunc(
        number(source.babies) ?? 0
      )
    ),

    seniors: Math.max(
      0,
      Math.trunc(
        number(source.seniors) ?? 0
      )
    ),

    guests:
      number(source.guests),

    currency,

    limit,

    sort: text(
      first(
        source.sort,
        "recommended"
      )
    )
  };
}


/* ==========================================================
   VALIDATE SEARCH
========================================================== */

function validateSearch(query) {
  if (!query.destination) {
    throw new Error(
      "Destination is required."
    );
  }

  if (
    !query.check_in_date ||
    !query.check_out_date
  ) {
    throw new Error(
      "Valid check-in and check-out dates are required."
    );
  }

  if (
    query.check_out_date <=
    query.check_in_date
  ) {
    throw new Error(
      "Check-out must be after check-in."
    );
  }
}


/* ==========================================================
   HOTEL SORTING
========================================================== */

function compareNumbers(
  a,
  b,
  descending = false
) {
  if (a == null && b == null) {
    return 0;
  }

  if (a == null) {
    return 1;
  }

  if (b == null) {
    return -1;
  }

  return descending
    ? b - a
    : a - b;
}

function sortHotels(
  hotels,
  sort
) {
  const result = hotels.slice();

  switch (sort) {
    case "price-low":
      result.sort(
        (a, b) =>
          compareNumbers(
            a.price,
            b.price
          )
      );
      break;

    case "price-high":
      result.sort(
        (a, b) =>
          compareNumbers(
            a.price,
            b.price,
            true
          )
      );
      break;

    case "rating":
      result.sort(
        (a, b) =>
          compareNumbers(
            a.rating,
            b.rating,
            true
          )
      );
      break;

    case "stars":
      result.sort(
        (a, b) =>
          compareNumbers(
            a.stars,
            b.stars,
            true
          )
      );
      break;

    case "reviews":
      result.sort(
        (a, b) =>
          compareNumbers(
            a.reviews,
            b.reviews,
            true
          )
      );
      break;

    default:
      /*
        Preserve SerpApi's original
        recommended order.
      */
      break;
  }

  return result;
}


/* ==========================================================
   EXTRACT SERPAPI PROPERTIES
========================================================== */

function extractProperties(data) {
  if (Array.isArray(data)) {
    return data;
  }

  const candidates = [
    data?.properties,
    data?.hotels,
    data?.results,
    data?.data?.properties,
    data?.data?.hotels,
    data?.data?.results
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}


/* ==========================================================
   MAIN VERCEL HANDLER
========================================================== */

export default async function handler(
  req,
  res
) {
  /*
    CORS
  */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  /*
    Preflight.
  */

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  /*
    Allowed methods.
  */

  if (
    req.method !== "GET" &&
    req.method !== "POST"
  ) {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  /*
    API key.
  */

  const apiKey =
    process.env.SERPAPI_API_KEY ||
    process.env.SERPAPI_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error:
        "SERPAPI_API_KEY is not configured."
    });
  }

  /*
    Parse and validate.
  */

  let query;

  try {
    query = parseSearch(req);

    validateSearch(query);

  } catch (error) {
    return res.status(400).json({
      success: false,
      error:
        error.message ||
        "Invalid hotel search."
    });
  }

  /*
    Search.
  */

  try {
    const params =
      new URLSearchParams();

    params.set(
      "engine",
      "google_hotels"
    );

    params.set(
      "api_key",
      apiKey
    );

    params.set(
      "q",
      query.destination
    );

    params.set(
      "check_in_date",
      query.check_in_date
    );

    params.set(
      "check_out_date",
      query.check_out_date
    );

    params.set(
      "adults",
      String(query.adults)
    );

    params.set(
      "children",
      String(query.children)
    );

    params.set(
      "currency",
      query.currency
    );

    params.set(
      "hl",
      "en"
    );

    params.set(
      "gl",
      "us"
    );

    /*
      Request up to the chosen limit.
      The actual number depends on SerpApi.
    */

    params.set(
      "num",
      String(query.limit)
    );

    /*
      Exactly one upstream request.
    */

    const response = await fetch(
      `${SERPAPI_ENDPOINT}?${params.toString()}`,
      {
        method: "GET",

        headers: {
          Accept: "application/json"
        },

        signal:
          AbortSignal.timeout(25000)
      }
    );

    const data = await response
      .json()
      .catch(() => {
        throw new Error(
          "SerpApi returned invalid JSON."
        );
      });

    if (
      !response.ok ||
      data.error
    ) {
      throw new Error(
        text(
          first(
            data.error,
            data.message
          )
        ) ||
        `SerpApi HTTP ${response.status}`
      );
    }

    /*
      Extract original properties.
    */

    const rawProperties =
      extractProperties(data);

    /*
      Normalize and deduplicate.
    */

    const hotels = [];

    const seen = new Set();

    for (
      let index = 0;
      index < rawProperties.length;
      index++
    ) {
      const hotel = normalizeHotel(
        rawProperties[index],
        index,
        query
      );

      if (!hotel) {
        continue;
      }

      const key = text(
        first(
          hotel.property_token,
          hotel.hotel_id,
          hotel.place_id,
          `${hotel.name.toLowerCase()}|${hotel.lat ?? ""}|${hotel.long ?? ""}`
        )
      ).toLowerCase();

      if (
        seen.has(key)
      ) {
        continue;
      }

      seen.add(key);

      hotels.push(hotel);
    }

    /*
      Sort and limit results.
    */

    const sortedHotels =
      sortHotels(
        hotels,
        query.sort
      );

    const selectedHotels =
      sortedHotels.slice(
        0,
        query.limit
      );

    /*
      Address diagnostics.
    */

    const streetAddressCount =
      selectedHotels.filter(
        hotel =>
          hotel.location_type ===
          "street"
      ).length;

    const areaLocationCount =
      selectedHotels.filter(
        hotel =>
          hotel.location_type ===
          "area"
      ).length;

    const missingLocationCount =
      selectedHotels.filter(
        hotel =>
          hotel.location_type ===
          "unavailable"
      ).length;

    /*
      Return JSON.
    */

    return res.status(200).json({
      success: true,

      hotels:
        selectedHotels,

      properties:
        selectedHotels,

      results:
        selectedHotels,

      search: query,

      pagination: {
        has_more: false,
        next_page_token: null
      },

      meta: {
        requested_limit:
          query.limit,

        raw_properties:
          rawProperties.length,

        unique_properties:
          hotels.length,

        returned_properties:
          selectedHotels.length,

        street_addresses:
          streetAddressCount,

        area_locations:
          areaLocationCount,

        unavailable_locations:
          missingLocationCount,

        serpapi_request_count: 1
      }
    });

  } catch (error) {
    console.error(
      "Bokkara Hotel Results API:",
      error
    );

    return res.status(502).json({
      success: false,

      error:
        error.message ||
        "Hotel search failed."
    });
  }
}
