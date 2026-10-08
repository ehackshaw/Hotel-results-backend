
/*
============================================================
BOKKARA — HOTEL RESULTS BACKEND
============================================================

FILE:
api/hotelresults.js

ENDPOINT:
GET /api/hotelresults

FEATURES:
- One SerpApi Google Hotels request per search
- Configurable number of properties: 1–100
- No hotel details requests
- No pagination or infinite scroll
- Hotel names
- Property addresses when available
- Hotel images
- Nightly and total stay pricing
- Guest ratings and review counts
- Star classifications
- Hotel amenities
- Free cancellation and breakfast indicators
- Property coordinates
- Property tokens for future details page
- Sorting
- CORS support

REQUIRED ENVIRONMENT VARIABLE:
SERPAPI_API_KEY

============================================================
*/

const ENDPOINT = "https://serpapi.com/search.json";

const MAX_HOTELS = 100;


/* ==========================================================
   GENERAL HELPERS
========================================================== */

const first = (...values) =>
  values.find(
    v =>
      v !== undefined &&
      v !== null &&
      v !== ""
  ) ?? "";

const text = v =>
  v == null || typeof v === "object"
    ? ""
    : String(v).trim();

const number = v => {
  if (v == null || v === "") return null;

  if (typeof v === "object") {
    return number(
      first(
        v.extracted_lowest,
        v.extracted_price,
        v.amount,
        v.value,
        v.extracted
      )
    );
  }

  const n = Number(
    String(v).replace(/[^\d.-]/g, "")
  );

  return Number.isFinite(n) ? n : null;
};

const yes = v =>
  v === true ||
  v === 1 ||
  String(v).toLowerCase() === "true";

const items = v =>
  Array.isArray(v)
    ? v
    : v
      ? [v]
      : [];

const unique = xs =>
  [...new Set(xs.filter(Boolean))];

const pickUrl = v => {
  const s = text(v);

  return /^https?:\/\//i.test(s)
    ? s
    : "";
};


/* ==========================================================
   DATE NORMALIZATION
========================================================== */

function dateISO(v) {
  const s = text(v);

  if (!s) return "";

  let y, m, d;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    [y, m, d] = s.split("-").map(Number);

  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    [d, m, y] = s.split("/").map(Number);

  } else {
    const x = new Date(s);

    if (!Number.isFinite(x.getTime())) {
      return "";
    }

    [y, m, d] = [
      x.getUTCFullYear(),
      x.getUTCMonth() + 1,
      x.getUTCDate()
    ];
  }

  const x = new Date(
    Date.UTC(y, m - 1, d)
  );

  return (
    x.getUTCFullYear() === y &&
    x.getUTCMonth() + 1 === m &&
    x.getUTCDate() === d
  )
    ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    : "";
}


/* ==========================================================
   PROPERTY ADDRESS EXTRACTION
========================================================== */

function addressString(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return /^(undefined|null|\[object object\])$/i
      .test(value.trim())
      ? ""
      : value.trim();
  }

  if (typeof value !== "object") {
    return "";
  }

  const direct = first(
    value.formatted_address,
    value.full_address
  );

  if (direct) {
    return addressString(direct);
  }

  const street = first(
    value.street_address,
    value.streetAddress,
    value.street,
    value.address_line1,
    value.address1,
    value.line1
  );

  if (street) {
    return unique([
      street,
      value.address_line2,
      value.city,
      value.locality,
      value.state,
      value.region,
      value.postal_code,
      value.country
    ].map(text)).join(", ");
  }

  return addressString(value.address);
}

function propertyAddress(h, destination) {
  const fields = [
    h.formatted_address,
    h.full_address,
    h.street_address,
    h.hotel_address,
    h.property_address,
    h.address,
    h.vicinity,
    h.location?.formatted_address,
    h.location?.address,
    h.property?.address,
    h.details?.address
  ];

  for (const field of fields) {
    const a = addressString(field);

    if (
      a &&
      a.toLowerCase() !== destination.toLowerCase()
    ) {
      return a;
    }
  }

  return "";
}


/* ==========================================================
   HOTEL PHOTOS
========================================================== */

function photos(h) {
  const sources = [
    h.thumbnail,
    h.image,
    h.image_url,
    h.main_image,
    ...items(h.images),
    ...items(h.photos),
    ...items(h.hotel_images)
  ];

  return unique(
    sources.map(x =>
      pickUrl(
        typeof x === "string"
          ? x
          : first(
              x?.original_image,
              x?.image,
              x?.url,
              x?.thumbnail,
              x?.src,
              x?.large
            )
      )
    )
  );
}


/* ==========================================================
   HOTEL AMENITIES
========================================================== */

function amenities(h) {
  const a = first(
    h.amenities,
    h.hotel_amenities,
    h.facilities,
    []
  );

  return unique(
    (
      Array.isArray(a)
        ? a
        : typeof a === "object"
          ? Object.values(a).flat()
          : String(a).split(",")
    ).map(x =>
      text(
        typeof x === "object"
          ? first(
              x?.name,
              x?.title,
              x?.label
            )
          : x
      )
    )
  );
}


/* ==========================================================
   NORMALIZE EACH HOTEL
========================================================== */

function normalize(h, index, q) {
  const name = text(
    first(
      h.name,
      h.hotel_name,
      h.property_name
    )
  );

  if (!name) return null;

  const address = propertyAddress(
    h,
    q.destination
  );

  const images = photos(h);

  const features = amenities(h);

  const token = text(
    first(
      h.property_token,
      h.propertyToken
    )
  );

  const price = number(
    first(
      h.rate_per_night?.extracted_lowest,
      h.rate_per_night?.extracted_price,
      h.extracted_price,
      h.price_per_night,
      h.price,
      h.rate?.extracted_lowest
    )
  );

  const total = number(
    first(
      h.total_rate?.extracted_lowest,
      h.total_rate?.extracted_price,
      h.total_price,
      h.extracted_total_price
    )
  );

  const stars = number(
    first(
      h.extracted_hotel_class,
      h.hotel_class,
      h.stars,
      h.star_rating
    )
  );

  const rating = number(
    first(
      h.overall_rating,
      h.rating,
      h.guest_rating
    )
  );

  const reviews = number(
    first(
      h.reviews,
      h.review_count,
      h.total_reviews
    )
  );

  const gps = first(
    h.gps_coordinates,
    h.coordinates,
    {}
  );

  const lat = number(
    first(
      gps.latitude,
      gps.lat,
      h.latitude,
      h.lat
    )
  );

  const long = number(
    first(
      gps.longitude,
      gps.lng,
      gps.long,
      h.longitude,
      h.long
    )
  );

  const freeBreakfast =
    yes(h.free_breakfast) ||
    features.some(a =>
      /complimentary breakfast|free breakfast|breakfast included/i
        .test(a)
    );

  const freeCancellation =
    yes(h.free_cancellation);

  return {
    id: text(
      first(
        token,
        h.hotel_id,
        h.place_id,
        h.id,
        `${name}|${index}`
      )
    ),

    index,

    property_token: token,

    hotel_id: text(h.hotel_id),

    place_id: text(h.place_id),

    name,

    type: text(
      first(
        h.type,
        "hotel"
      )
    ),

    address,

    formatted_address: address,

    address_available: !!address,

    neighborhood: text(h.neighborhood),

    city: text(h.city),

    country: text(h.country),

    stars,

    hotel_class: stars,

    rating,

    reviews,

    review_count: reviews,

    price,

    extracted_price: price,

    price_per_night: price,

    total_price: total,

    before_taxes_fees: number(
      first(
        h.rate_per_night
          ?.extracted_before_taxes_fees,
        h.extracted_before_taxes_fees
      )
    ),

    currency: q.currency,

    images,

    image: images[0] || "",

    thumbnail: images[0] || "",

    image_count: images.length,

    amenities: features,

    free_cancellation: freeCancellation,

    free_breakfast: freeBreakfast,

    lat,

    long,

    latitude: lat,

    longitude: long,

    deal: h.deal || "",

    deal_description: text(
      h.deal_description
    ),

    sponsored: yes(h.sponsored),

    eco_certified: yes(
      h.eco_certified
    ),

    serpapi_property_details_link: text(
      h.serpapi_property_details_link
    )
  };
}


/* ==========================================================
   READ SEARCH PARAMETERS
========================================================== */

function parse(req) {
  const s = req.method === "POST"
    ? req.body || {}
    : req.query || {};

  const destination = text(
    first(
      s.destination,
      s.q,
      s.location
    )
  );

  const check_in_date = dateISO(
    first(
      s.checkin,
      s.check_in_date,
      s.checkIn
    )
  );

  const check_out_date = dateISO(
    first(
      s.checkout,
      s.check_out_date,
      s.checkOut
    )
  );

  const requested = number(
    first(
      s.limit,
      s.count,
      s.properties,
      20
    )
  );

  const limit = Math.min(
    MAX_HOTELS,
    Math.max(
      1,
      Math.trunc(requested || 20)
    )
  );

  const adults = Math.max(
    1,
    Math.trunc(
      number(
        first(s.adults, 1)
      ) || 1
    )
  );

  const children = Math.max(
    0,
    Math.trunc(
      number(s.children) || 0
    )
  );

  const rooms = Math.max(
    1,
    Math.trunc(
      number(
        first(s.rooms, 1)
      ) || 1
    )
  );

  const currency =
    /^[A-Z]{3}$/.test(
      text(s.currency).toUpperCase()
    )
      ? text(s.currency).toUpperCase()
      : "USD";

  return {
    destination,

    check_in_date,

    check_out_date,

    adults,

    children,

    rooms,

    babies: Math.max(
      0,
      Math.trunc(
        number(s.babies) || 0
      )
    ),

    seniors: Math.max(
      0,
      Math.trunc(
        number(s.seniors) || 0
      )
    ),

    guests: number(s.guests),

    currency,

    limit
  };
}


/* ==========================================================
   VALIDATE SEARCH
========================================================== */

function validate(q) {
  if (!q.destination) {
    throw new Error(
      "Destination is required."
    );
  }

  if (
    !q.check_in_date ||
    !q.check_out_date
  ) {
    throw new Error(
      "Valid check-in and check-out dates are required."
    );
  }

  if (
    q.check_out_date <= q.check_in_date
  ) {
    throw new Error(
      "Check-out must be after check-in."
    );
  }
}


/* ==========================================================
   HOTEL SORTING
========================================================== */

function sortHotels(hotels, sort) {
  const x = hotels.slice();

  const value = h =>
    h == null ? null : h;

  const asc = (a, b) =>
    value(a) == null
      ? 1
      : value(b) == null
        ? -1
        : a - b;

  if (sort === "price-low") {
    x.sort(
      (a, b) =>
        asc(a.price, b.price)
    );
  }

  if (sort === "price-high") {
    x.sort(
      (a, b) =>
        asc(b.price, a.price)
    );
  }

  if (sort === "rating") {
    x.sort(
      (a, b) =>
        asc(b.rating, a.rating)
    );
  }

  if (sort === "stars") {
    x.sort(
      (a, b) =>
        asc(b.stars, a.stars)
    );
  }

  if (sort === "reviews") {
    x.sort(
      (a, b) =>
        asc(b.reviews, a.reviews)
    );
  }

  return x;
}


/* ==========================================================
   MAIN VERCEL API HANDLER
========================================================== */

export default async function handler(req, res) {

  /* CORS */

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


  /* PREFLIGHT */

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }


  /* ALLOWED METHODS */

  if (
    !["GET", "POST"].includes(
      req.method
    )
  ) {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }


  /* CHECK API KEY */

  if (
    !process.env.SERPAPI_API_KEY
  ) {
    return res.status(500).json({
      success: false,
      error:
        "SERPAPI_API_KEY is not configured."
    });
  }


  /* PARSE AND VALIDATE */

  let q;

  try {
    q = parse(req);

    validate(q);

  } catch (e) {
    return res.status(400).json({
      success: false,
      error: e.message
    });
  }


  /* SEARCH HOTELS */

  try {

    const p = new URLSearchParams({

      engine: "google_hotels",

      api_key:
        process.env.SERPAPI_API_KEY,

      q: q.destination,

      check_in_date:
        q.check_in_date,

      check_out_date:
        q.check_out_date,

      adults:
        String(q.adults),

      children:
        String(q.children),

      currency:
        q.currency,

      hl: "en",

      gl: "us",

      num: String(q.limit)

    });


    /*
      SerpApi determines how many
      properties are actually returned.
    */

    const response = await fetch(
      `${ENDPOINT}?${p}`,
      {
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
          "Invalid JSON from SerpApi."
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
        `SerpApi returned HTTP ${response.status}`
      );
    }


    /*
      Extract returned hotel properties.
    */

    const raw =
      Array.isArray(data.properties)
        ? data.properties
        : Array.isArray(data.hotels)
          ? data.hotels
          : Array.isArray(data.results)
            ? data.results
            : [];


    /*
      Normalize and deduplicate.
    */

    const seen = new Set();

    const hotels = [];


    for (
      let i = 0;
      i < raw.length;
      i++
    ) {

      const h = normalize(
        raw[i],
        i,
        q
      );

      if (!h) continue;

      const key = text(
        first(
          h.property_token,
          h.hotel_id,
          h.place_id,
          `${h.name.toLowerCase()}|${h.address.toLowerCase()}`
        )
      );

      if (
        seen.has(key)
      ) {
        continue;
      }

      seen.add(key);

      hotels.push(h);
    }


    /*
      Optional sorting.
    */

    const s =
      req.method === "POST"
        ? req.body || {}
        : req.query || {};

    const selected = sortHotels(
      hotels,
      text(
        s.sort || "recommended"
      )
    ).slice(
      0,
      q.limit
    );


    /*
      Return the results to Shopify.
    */

    return res.status(200).json({

      success: true,

      hotels: selected,

      properties: selected,

      results: selected,

      search: q,

      pagination: {
        has_more: false,
        next_page_token: null
      },

      meta: {

        requested_limit:
          q.limit,

        raw_properties:
          raw.length,

        unique_properties:
          hotels.length,

        returned_properties:
          selected.length,

        serpapi_request_count: 1

      }

    });

  } catch (e) {

    console.error(
      "Bokkara hotel results:",
      e
    );

    return res.status(502).json({

      success: false,

      error:
        e.message ||
        "Hotel search failed."

    });

  }
}
