/**
 * =========================================================
 * BOKKARA HOTEL RESULTS API
 * =========================================================
 *
 * SERPAPI:
 * Google Hotels
 *
 * VERCEL:
 * /api/hotelresults
 *
 * ENVIRONMENT VARIABLE:
 * SERPAPI_API_KEY
 *
 * =========================================================
 */

'use strict';


const SERPAPI_URL =
  'https://serpapi.com/search';


const MAX_RESULTS_PER_PAGE = 20;


/* =========================================================
   CORS
========================================================= */

function setCors(res) {

  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate'
  );

}


/* =========================================================
   BASIC HELPERS
========================================================= */

function clean(value) {

  if (
    value === undefined ||
    value === null
  ) {

    return '';

  }

  return String(value).trim();

}


function number(
  value,
  fallback = 0
) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    return fallback;

  }

  if (
    typeof value === 'number'
  ) {

    return Number.isFinite(value)
      ? value
      : fallback;

  }

  const parsed =
    Number(
      String(value)
        .replace(
          /[^0-9.-]/g,
          ''
        )
    );

  return Number.isFinite(parsed)
    ? parsed
    : fallback;

}


function boolean(value) {

  if (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 1
  ) {

    return true;

  }

  return false;

}


function arrayFrom(value) {

  if (
    Array.isArray(value)
  ) {

    return value
      .map(
        item => clean(item)
      )
      .filter(Boolean);

  }

  if (!value) {

    return [];

  }

  return String(value)
    .split(',')
    .map(
      item =>
        item.trim()
    )
    .filter(Boolean);

}


/* =========================================================
   DATE VALIDATION
========================================================= */

function isValidDate(value) {

  if (!value) {

    return false;

  }

  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value)
  );

}


/* =========================================================
   ADDRESS NORMALIZATION
========================================================= */

function getAddress(
  hotel
) {

  /*
   * Google Hotels may return the
   * property address in different
   * structures depending on the
   * result.
   */

  const directCandidates = [

    hotel.address,

    hotel.property_address,

    hotel.hotel_address,

    hotel.formatted_address,

    hotel.location_address,

    hotel.hotel_location,

    hotel.location

  ];


  for (
    const candidate
    of directCandidates
  ) {

    if (
      typeof candidate ===
      'string' &&
      candidate.trim()
    ) {

      return candidate.trim();

    }

  }


  /*
   * Nested location object.
   */

  if (
    hotel.location &&
    typeof hotel.location ===
      'object'
  ) {

    const nestedCandidates = [

      hotel.location.address,

      hotel.location.formatted_address,

      hotel.location.full_address,

      hotel.location.name

    ];


    for (
      const candidate
      of nestedCandidates
    ) {

      if (
        typeof candidate ===
        'string' &&
        candidate.trim()
      ) {

        return candidate.trim();

      }

    }

  }


  /*
   * Nested address object.
   */

  if (
    hotel.address &&
    typeof hotel.address ===
      'object'
  ) {

    const addressObject =
      hotel.address;


    const parts = [

      addressObject.street,
      addressObject.street_address,
      addressObject.address_line_1,
      addressObject.address_line_2,
      addressObject.city,
      addressObject.state,
      addressObject.region,
      addressObject.postal_code,
      addressObject.zip,
      addressObject.country

    ]
      .map(
        value => clean(value)
      )
      .filter(Boolean);


    if (
      parts.length
    ) {

      return [
        ...new Set(parts)
      ].join(', ');

    }

  }


  /*
   * Build an address from the
   * separate Google fields when
   * necessary.
   */

  const fallbackParts = [

    hotel.street,
    hotel.street_address,
    hotel.address_line_1,
    hotel.address_line_2,
    hotel.city,
    hotel.state,
    hotel.region,
    hotel.postal_code,
    hotel.zip,
    hotel.country

  ]
    .map(
      value => clean(value)
    )
    .filter(Boolean);


  if (
    fallbackParts.length
  ) {

    return [
      ...new Set(fallbackParts)
    ].join(', ');

  }


  return '';

}


/* =========================================================
   NORMALIZE AMENITIES
========================================================= */

function normalizeAmenities(
  hotel
) {

  const source =

    Array.isArray(
      hotel.amenities
    )

      ? hotel.amenities

      : (
          Array.isArray(
            hotel.facilities
          )
            ? hotel.facilities
            : []
        );


  return source
    .map(
      item => {

        if (
          typeof item ===
          'string'
        ) {

          return clean(item);

        }

        if (
          item &&
          typeof item ===
          'object'
        ) {

          return clean(
            item.name ||
            item.title ||
            item.label ||
            item.text
          );

        }

        return '';

      }
    )
    .filter(Boolean);

}


/* =========================================================
   NORMALIZE IMAGES
========================================================= */

function normalizeImages(
  hotel
) {

  const images = [];


  if (
    hotel.thumbnail
  ) {

    images.push(
      clean(
        hotel.thumbnail
      )
    );

  }


  if (
    hotel.image
  ) {

    images.push(
      clean(
        hotel.image
      )
    );

  }


  if (
    Array.isArray(
      hotel.images
    )
  ) {

    hotel.images.forEach(
      image => {

        if (
          typeof image ===
          'string'
        ) {

          if (
            image.trim()
          ) {

            images.push(
              image.trim()
            );

          }

          return;

        }


        if (
          image &&
          typeof image ===
          'object'
        ) {

          const url =

            image.original_image ||

            image.original ||

            image.image ||

            image.thumbnail ||

            image.url ||

            image.src;


          if (
            url
          ) {

            images.push(
              String(url).trim()
            );

          }

        }

      }
    );

  }


  /*
   * Some Google Hotels responses
   * expose photos instead of images.
   */

  if (
    Array.isArray(
      hotel.photos
    )
  ) {

    hotel.photos.forEach(
      photo => {

        if (
          typeof photo ===
          'string'
        ) {

          if (
            photo.trim()
          ) {

            images.push(
              photo.trim()
            );

          }

          return;

        }


        if (
          photo &&
          typeof photo ===
          'object'
        ) {

          const url =

            photo.original_image ||

            photo.original ||

            photo.image ||

            photo.thumbnail ||

            photo.url;


          if (
            url
          ) {

            images.push(
              String(url).trim()
            );

          }

        }

      }
    );

  }


  return [
    ...new Set(
      images.filter(Boolean)
    )
  ];

}


/* =========================================================
   PRICE EXTRACTION
========================================================= */

function getPrice(
  hotel
) {

  const candidates = [

    hotel.rate_per_night &&
      hotel.rate_per_night
        .extracted_lowest,

    hotel.rate_per_night &&
      hotel.rate_per_night
        .lowest,

    hotel.extracted_price,

    hotel.extractedPrice,

    hotel.total_rate &&
      hotel.total_rate
        .extracted_lowest,

    hotel.total_rate &&
      hotel.total_rate
        .lowest,

    hotel.total_price,

    hotel.totalPrice,

    hotel.member_price,

    hotel.memberPrice,

    hotel.price_per_night,

    hotel.pricePerNight,

    hotel.price,

    hotel.rate

  ];


  for (
    const candidate
    of candidates
  ) {

    if (
      candidate &&
      typeof candidate ===
        'object'
    ) {

      const nested = [

        candidate.extracted_lowest,

        candidate.lowest,

        candidate.amount,

        candidate.value,

        candidate.total,

        candidate.price

      ];


      for (
        const value
        of nested
      ) {

        const parsed =
          number(
            value,
            0
          );


        if (
          parsed > 0
        ) {

          return parsed;

        }

      }

      continue;

    }


    const parsed =
      number(
        candidate,
        0
      );


    if (
      parsed > 0
    ) {

      return parsed;

    }

  }


  return 0;

}


/* =========================================================
   PRICE DISPLAY
========================================================= */

function getPriceDisplay(
  hotel,
  price
) {

  if (
    hotel.rate_per_night &&
    hotel.rate_per_night.lowest
  ) {

    return clean(
      hotel.rate_per_night.lowest
    );

  }


  if (
    hotel.price &&
    typeof hotel.price ===
      'string'
  ) {

    return clean(
      hotel.price
    );

  }


  if (
    price > 0
  ) {

    return `US$${price}`;

  }


  return '';

}


/* =========================================================
   BEFORE TAXES
========================================================= */

function getBeforeTaxes(
  hotel
) {

  if (
    hotel.rate_per_night &&
    hotel.rate_per_night
      .before_taxes_fees
  ) {

    return clean(
      hotel.rate_per_night
        .before_taxes_fees
    );

  }


  if (
    hotel.before_taxes_fees
  ) {

    return clean(
      hotel.before_taxes_fees
    );

  }


  return '';

}


/* =========================================================
   NORMALIZE HOTEL
========================================================= */

function normalizeHotel(
  hotel,
  index
) {

  if (
    !hotel ||
    typeof hotel !==
      'object'
  ) {

    return null;

  }


  const amenities =
    normalizeAmenities(
      hotel
    );


  const images =
    normalizeImages(
      hotel
    );


  const price =
    getPrice(
      hotel
    );


  const address =
    getAddress(
      hotel
    );


  const rating =
    number(
      hotel.overall_rating ??
      hotel.rating,
      0
    );


  const reviews =
    number(
      hotel.reviews ??
      hotel.review_count ??
      hotel.reviews_count,
      0
    );


  const stars =
    number(
      hotel.hotel_class ??
      hotel.stars,
      0
    );


  const propertyToken =
    clean(
      hotel.property_token
    );


  const latitude =
    hotel.gps_coordinates &&
    hotel.gps_coordinates.latitude !==
      undefined

      ? number(
          hotel.gps_coordinates
            .latitude,
          null
        )

      : (
          hotel.latitude !==
            undefined

            ? number(
                hotel.latitude,
                null
              )

            : null
        );


  const longitude =
    hotel.gps_coordinates &&
    hotel.gps_coordinates.longitude !==
      undefined

      ? number(
          hotel.gps_coordinates
            .longitude,
          null
        )

      : (
          hotel.longitude !==
            undefined

            ? number(
                hotel.longitude,
                null
              )

            : null
        );


  const fallbackId =
    [

      clean(
        hotel.name
      ),

      address,

      latitude !== null
        ? latitude
        : '',

      longitude !== null
        ? longitude
        : ''

    ]
      .filter(Boolean)
      .join('|');


  return {

    id:

      propertyToken ||

      fallbackId ||

      `hotel-${index}`,


    property_token:

      propertyToken ||

      null,


    name:

      clean(
        hotel.name
      ),


    type:

      clean(
        hotel.type
      ) ||
      'hotel',


    description:

      clean(
        hotel.description
      ),


    /*
     * IMPORTANT:
     *
     * The frontend can now use
     * either "address" or
     * "property_address".
     */

    address,

    property_address:
      address,

    hotel_address:
      address,


    neighborhood:

      clean(
        hotel.neighborhood
      ),


    city:

      clean(
        hotel.city
      ),


    country:

      clean(
        hotel.country
      ),


    phone:

      clean(
        hotel.phone
      ),


    website:

      clean(
        hotel.link ||
        hotel.website
      ),


    thumbnail:

      clean(
        hotel.thumbnail ||
        hotel.image
      ),


    images,


    hotel_class:
      stars,


    stars,


    overall_rating:
      rating,


    rating,


    reviews,


    review_count:
      reviews,


    price,


    extracted_price:
      price,


    price_display:
      getPriceDisplay(
        hotel,
        price
      ),


    lowest_price:
      getPriceDisplay(
        hotel,
        price
      ),


    before_taxes_fees:
      getBeforeTaxes(
        hotel
      ),


    amenities,


    free_cancellation:
      Boolean(
        hotel.free_cancellation
      ),


    free_breakfast:
      Boolean(
        hotel.free_breakfast
      ),


    eco_certified:
      Boolean(
        hotel.eco_certified
      ),


    sponsored:
      Boolean(
        hotel.sponsored
      ),


    check_in_time:

      clean(
        hotel.check_in_time
      ),


    check_out_time:

      clean(
        hotel.check_out_time
      ),


    latitude,


    longitude,


    gps_coordinates:

      hotel.gps_coordinates ||
      null,


    nearby_places:

      Array.isArray(
        hotel.nearby_places
      )
        ? hotel.nearby_places
        : [],


    prices:

      Array.isArray(
        hotel.prices
      )
        ? hotel.prices
        : [],


    property_details_link:

      clean(
        hotel.serpapi_property_details_link
      ),


    serpapi_property_details_link:

      clean(
        hotel.serpapi_property_details_link
      ),


    raw:
      hotel

  };

}


/* =========================================================
   AMENITY MATCHING
========================================================= */

function hotelHasAmenity(
  hotel,
  requestedAmenity
) {

  const amenities =
    Array.isArray(
      hotel.amenities
    )
      ? hotel.amenities
      : [];


  const target =
    clean(
      requestedAmenity
    )
    .toLowerCase();


  if (
    !target
  ) {

    return true;

  }


  return amenities.some(
    amenity => {

      const value =
        clean(
          amenity
        )
        .toLowerCase();


      return (
        value.includes(target) ||
        target.includes(value)
      );

    }
  );

}


/* =========================================================
   FILTER HOTELS
========================================================= */

function filterHotels(
  hotels,
  filters
) {

  let results =
    [...hotels];


  /*
   * PRICE
   */

  if (
    filters.min_price !== null
  ) {

    results =
      results.filter(
        hotel => {

          return (
            hotel.price > 0 &&
            hotel.price >=
              filters.min_price
          );

        }
      );

  }


  if (
    filters.max_price !== null
  ) {

    results =
      results.filter(
        hotel => {

          return (
            hotel.price > 0 &&
            hotel.price <=
              filters.max_price
          );

        }
      );

  }


  /*
   * HOTEL STAR CLASS
   */

  if (
    filters.hotel_class !== null
  ) {

    results =
      results.filter(
        hotel => {

          return (
            hotel.stars > 0 &&
            hotel.stars >=
              filters.hotel_class
          );

        }
      );

  }


  /*
   * GUEST RATING
   */

  if (
    filters.min_rating !== null
  ) {

    results =
      results.filter(
        hotel => {

          return (
            hotel.rating > 0 &&
            hotel.rating >=
              filters.min_rating
          );

        }
      );

  }


  /*
   * AMENITIES
   */

  if (
    filters.amenities.length
  ) {

    results =
      results.filter(
        hotel => {

          return filters.amenities.every(
            amenity =>
              hotelHasAmenity(
                hotel,
                amenity
              )
          );

        }
      );

  }


  /*
   * FREE CANCELLATION
   */

  if (
    filters.free_cancellation
  ) {

    results =
      results.filter(
        hotel =>
          hotel.free_cancellation ===
          true
      );

  }


  /*
   * FREE BREAKFAST
   */

  if (
    filters.free_breakfast
  ) {

    results =
      results.filter(
        hotel =>
          hotel.free_breakfast ===
          true
      );

  }


  return results;

}


/* =========================================================
   SORT HOTELS
========================================================= */

function sortHotels(
  hotels,
  sort
) {

  const results =
    [...hotels];


  switch (
    String(sort)
      .toLowerCase()
      .trim()
  ) {


    case 'price-low':
    case 'price_low':
    case 'lowest-price':
    case 'lowest_price':
    case 'price_asc':

      results.sort(
        (a, b) => {

          /*
           * Hotels without a price
           * go to the bottom.
           */

          if (
            !a.price &&
            !b.price
          ) {

            return 0;

          }


          if (
            !a.price
          ) {

            return 1;

          }


          if (
            !b.price
          ) {

            return -1;

          }


          return (
            a.price -
            b.price
          );

        }
      );

      break;


    case 'price-high':
    case 'price_high':
    case 'highest-price':
    case 'highest_price':
    case 'price_desc':

      results.sort(
        (a, b) => {

          if (
            !a.price &&
            !b.price
          ) {

            return 0;

          }


          if (
            !a.price
          ) {

            return 1;

          }


          if (
            !b.price
          ) {

            return -1;

          }


          return (
            b.price -
            a.price
          );

        }
      );

      break;


    case 'rating':
    case 'rating-high':
    case 'rating-highest':
    case 'highest-rating':

      results.sort(
        (a, b) =>
          number(
            b.rating
          ) -
          number(
            a.rating
          )
      );

      break;


    case 'stars':
    case 'stars-high':
    case 'stars-highest':
    case 'highest-stars':

      results.sort(
        (a, b) => {

          const starDifference =
            number(
              b.stars
            ) -
            number(
              a.stars
            );


          if (
            starDifference !==
            0
          ) {

            return starDifference;

          }


          return (
            number(
              b.rating
            ) -
            number(
              a.rating
            )
          );

        }
      );

      break;


    case 'recommended':
    case 'recommend':
    case '':

    default:

      results.sort(
        (a, b) => {

          const aScore =

            (
              number(
                a.rating
              ) * 10
            ) +

            (
              number(
                a.stars
              ) * 2
            ) +

            (
              a.free_cancellation
                ? 1
                : 0
            ) +

            (
              a.free_breakfast
                ? 1
                : 0
            );


          const bScore =

            (
              number(
                b.rating
              ) * 10
            ) +

            (
              number(
                b.stars
              ) * 2
            ) +

            (
              b.free_cancellation
                ? 1
                : 0
            ) +

            (
              b.free_breakfast
                ? 1
                : 0
            );


          return (
            bScore -
            aScore
          );

        }
      );

      break;

  }


  return results;

}


/* =========================================================
   GET REQUEST PARAMETERS
========================================================= */

function getParams(
  req
) {

  const source =

    req.method ===
    'POST'

      ? (
          req.body &&
          typeof req.body ===
            'object'

            ? req.body

            : {}
        )

      : (
          req.query ||
          {}
        );


  const destination =
    clean(
      source.destination ||
      source.q ||
      'Port of Spain'
    );


  const checkIn =
    clean(
      source.check_in ||
      source.check_in_date ||
      source.checkin
    );


  const checkOut =
    clean(
      source.check_out ||
      source.check_out_date ||
      source.checkout
    );


  const rooms =
    Math.max(
      1,
      number(
        source.rooms,
        1
      )
    );


  const adults =
    Math.max(
      0,
      number(
        source.adults,
        2
      )
    );


  const children =
    Math.max(
      0,
      number(
        source.children,
        0
      )
    );


  const babies =
    Math.max(
      0,
      number(
        source.babies ||
        source.infants,
        0
      )
    );


  const seniors =
    Math.max(
      0,
      number(
        source.seniors,
        0
      )
    );


  const guests =
    Math.max(
      1,
      number(
        source.guests,
        adults +
        children +
        babies +
        seniors
      )
    );


  const nextPageToken =
    clean(
      source.next_page_token ||
      source.nextPageToken ||
      source.page_token ||
      source.pageToken ||
      ''
    );


  const sort =
    clean(
      source.sort ||
      'recommended'
    );


  const minPrice =

    source.min_price !==
      undefined &&
    source.min_price !== ''

      ? number(
          source.min_price
        )

      : null;


  const maxPrice =

    source.max_price !==
      undefined &&
    source.max_price !== ''

      ? number(
          source.max_price
        )

      : null;


  const hotelClass =

    source.hotel_class !==
      undefined &&
    source.hotel_class !== ''

      ? number(
          source.hotel_class
        )

      : null;


  const minRating =

    source.min_rating !==
      undefined &&
    source.min_rating !== ''

      ? number(
          source.min_rating
        )

      : null;


  const amenities =
    arrayFrom(
      source.amenities
    );


  const freeCancellation =
    boolean(
      source.free_cancellation
    );


  const freeBreakfast =
    boolean(
      source.free_breakfast
    );


  return {

    destination,

    checkIn,

    checkOut,

    rooms,

    adults,

    children,

    babies,

    seniors,

    guests,

    nextPageToken,

    sort,

    minPrice,

    maxPrice,

    hotelClass,

    minRating,

    amenities,

    freeCancellation,

    freeBreakfast

  };

}


/* =========================================================
   EXTRACT NEXT PAGE TOKEN
========================================================= */

function extractNextPageToken(
  data
) {

  const possibleTokens = [

    data &&
    data.next_page_token,

    data &&
    data.nextPageToken,

    data &&
    data.serpapi_pagination &&
    data.serpapi_pagination
      .next_page_token,

    data &&
    data.serpapi_pagination &&
    data.serpapi_pagination
      .nextPageToken,

    data &&
    data.pagination &&
    data.pagination
      .next_page_token,

    data &&
    data.pagination &&
    data.pagination
      .nextPageToken,

    data &&
    data.data &&
    data.data.next_page_token,

    data &&
    data.data &&
    data.data.nextPageToken,

    data &&
    data.data &&
    data.data.pagination &&
    data.data.pagination
      .next_page_token,

    data &&
    data.data &&
    data.data.pagination &&
    data.data.pagination
      .nextPageToken

  ];


  for (
    const token
    of possibleTokens
  ) {

    if (
      token !==
        undefined &&
      token !==
        null
    ) {

      const value =
        String(
          token
        ).trim();


      if (
        value
      ) {

        return value;

      }

    }

  }


  return null;

}


/* =========================================================
   EXTRACT PROPERTIES
========================================================= */

function extractProperties(
  data
) {

  const candidates = [

    data &&
    data.properties,

    data &&
    data.results,

    data &&
    data.hotels,

    data &&
    data.data &&
    data.data.properties,

    data &&
    data.data &&
    data.data.results,

    data &&
    data.data &&
    data.data.hotels,

    data &&
    data.serpapi &&
    data.serpapi.properties

  ];


  for (
    const candidate
    of candidates
  ) {

    if (
      Array.isArray(
        candidate
      )
    ) {

      return candidate;

    }

  }


  return [];

}


/* =========================================================
   API HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  setCors(res);


  /* =======================================================
     OPTIONS
  ======================================================= */

  if (
    req.method ===
    'OPTIONS'
  ) {

    return res
      .status(200)
      .end();

  }


  /* =======================================================
     METHOD
  ======================================================= */

  if (
    req.method !== 'GET' &&
    req.method !== 'POST'
  ) {

    return res
      .status(405)
      .json({

        success: false,

        error:
          'Method not allowed.'

      });

  }


  /* =======================================================
     API KEY
  ======================================================= */

  const apiKey =
    process.env.SERPAPI_API_KEY;


  if (!apiKey) {

    return res
      .status(500)
      .json({

        success: false,

        error:
          'SERPAPI_API_KEY is not configured.'

      });

  }


  try {

    const params =
      getParams(
        req
      );


    /* =====================================================
       DATE VALIDATION
    ===================================================== */

    if (
      !isValidDate(
        params.checkIn
      )
    ) {

      return res
        .status(400)
        .json({

          success: false,

          error:
            'check_in_date must use YYYY-MM-DD.'

        });

    }


    if (
      !isValidDate(
        params.checkOut
      )
    ) {

      return res
        .status(400)
        .json({

          success: false,

          error:
            'check_out_date must use YYYY-MM-DD.'

        });

    }


    /* =====================================================
       SERPAPI PARAMETERS
    ===================================================== */

    const serpParams =
      new URLSearchParams();


    serpParams.set(
      'engine',
      'google_hotels'
    );


    serpParams.set(
      'api_key',
      apiKey
    );


    serpParams.set(
      'q',
      params.destination
    );


    serpParams.set(
      'check_in_date',
      params.checkIn
    );


    serpParams.set(
      'check_out_date',
      params.checkOut
    );


    serpParams.set(
      'adults',
      String(
        Math.max(
          1,
          params.adults
        )
      )
    );


    serpParams.set(
      'children',
      String(
        params.children
      )
    );


    serpParams.set(
      'rooms',
      String(
        params.rooms
      )
    );


    serpParams.set(
      'currency',
      'USD'
    );


    serpParams.set(
      'hl',
      'en'
    );


    serpParams.set(
      'gl',
      'us'
    );


    /*
     * Ask SerpAPI for a healthy
     * number of properties.
     */

    serpParams.set(
      'num',
      String(
        MAX_RESULTS_PER_PAGE
      )
    );


    /* =====================================================
       PAGINATION
    ===================================================== */

    if (
      params.nextPageToken
    ) {

      serpParams.set(
        'next_page_token',
        params.nextPageToken
      );

    }


    /*
     * Only send price/star filters
     * that Google Hotels supports.
     *
     * The remaining filters are
     * applied locally after the
     * response is received.
     */

    if (
      params.minPrice !== null
    ) {

      serpParams.set(
        'min_price',
        String(
          params.minPrice
        )
      );

    }


    if (
      params.maxPrice !== null
    ) {

      serpParams.set(
        'max_price',
        String(
          params.maxPrice
        )
      );

    }


    if (
      params.hotelClass !== null
    ) {

      serpParams.set(
        'hotel_class',
        String(
          params.hotelClass
        )
      );

    }


    /* =====================================================
       SERPAPI URL
    ===================================================== */

    const url =
      `${SERPAPI_URL}?${serpParams.toString()}`;


    console.log(
      'BOKKARA HOTEL REQUEST:',
      {

        destination:
          params.destination,

        checkIn:
          params.checkIn,

        checkOut:
          params.checkOut,

        rooms:
          params.rooms,

        adults:
          params.adults,

        children:
          params.children,

        babies:
          params.babies,

        seniors:
          params.seniors,

        sort:
          params.sort,

        filters: {

          minPrice:
            params.minPrice,

          maxPrice:
            params.maxPrice,

          hotelClass:
            params.hotelClass,

          minRating:
            params.minRating,

          amenities:
            params.amenities,

          freeCancellation:
            params.freeCancellation,

          freeBreakfast:
            params.freeBreakfast

        },

        nextPage:
          Boolean(
            params.nextPageToken
          )

      }
    );


    /* =====================================================
       FETCH SERPAPI
    ===================================================== */

    const controller =
      new AbortController();


    const timeout =
      setTimeout(
        () => {

          controller.abort();

        },
        30000
      );


    let response;


    try {

      response =
        await fetch(
          url,
          {

            method:
              'GET',

            signal:
              controller.signal

          }
        );

    }

    finally {

      clearTimeout(
        timeout
      );

    }


    /* =====================================================
       READ RESPONSE
    ===================================================== */

    const responseText =
      await response.text();


    let data;


    try {

      data =
        responseText
          ? JSON.parse(
              responseText
            )
          : {};

    }

    catch (
      jsonError
    ) {

      console.error(
        'SERPAPI NON-JSON RESPONSE:',
        responseText
      );


      return res
        .status(502)
        .json({

          success: false,

          error:
            'SerpApi returned an invalid response.',

          serpapi_status:
            response.status

        });

    }


    /* =====================================================
       HTTP ERROR
    ===================================================== */

    if (
      !response.ok
    ) {

      console.error(
        'SERPAPI HTTP ERROR:',
        {

          status:
            response.status,

          data

        }
      );


      return res
        .status(
          response.status >= 400 &&
          response.status < 600

            ? response.status

            : 502
        )
        .json({

          success: false,

          error:
            data.error ||
            data.message ||
            'SerpApi request failed.',

          serpapi: {

            status:
              response.status,

            error:
              data.error ||
              null

          },

          requested_next_page:
            Boolean(
              params.nextPageToken
            )

        });

    }


    /* =====================================================
       API-LEVEL ERROR
    ===================================================== */

    if (
      data &&
      data.error
    ) {

      console.error(
        'SERPAPI API ERROR:',
        data.error
      );


      return res
        .status(400)
        .json({

          success: false,

          error:
            data.error,

          requested_next_page:
            Boolean(
              params.nextPageToken
            ),

          serpapi:
            data

        });

    }


    /* =====================================================
       EXTRACT PROPERTIES
    ===================================================== */

    const rawProperties =
      extractProperties(
        data
      );


    console.log(
      'BOKKARA SERPAPI RESULTS:',
      {

        requestedNextPage:
          Boolean(
            params.nextPageToken
          ),

        propertiesReturned:
          rawProperties.length

      }
    );


    /* =====================================================
       NORMALIZE
    ===================================================== */

    let hotels =
      rawProperties
        .map(
          (
            hotel,
            index
          ) =>
            normalizeHotel(
              hotel,
              index
            )
        )
        .filter(Boolean);


    /* =====================================================
       FILTER
    ===================================================== */

    const beforeFilterCount =
      hotels.length;


    hotels =
      filterHotels(
        hotels,
        {

          min_price:
            params.minPrice,

          max_price:
            params.maxPrice,

          hotel_class:
            params.hotelClass,

          min_rating:
            params.minRating,

          amenities:
            params.amenities,

          free_cancellation:
            params.freeCancellation,

          free_breakfast:
            params.freeBreakfast

        }
      );


    const afterFilterCount =
      hotels.length;


    /* =====================================================
       SORT
    ===================================================== */

    hotels =
      sortHotels(
        hotels,
        params.sort
      );


    /* =====================================================
       LIMIT
    ===================================================== */

    hotels =
      hotels.slice(
        0,
        MAX_RESULTS_PER_PAGE
      );


    /* =====================================================
       PAGINATION TOKEN
    ===================================================== */

    const nextPageToken =
      extractNextPageToken(
        data
      );


    const hasNextPage =
      Boolean(
        nextPageToken
      );


    const serpPagination =
      data.serpapi_pagination ||
      data.pagination ||
      {};


    /* =====================================================
       RESPONSE
    ===================================================== */

    return res
      .status(200)
      .json({

        success:
          true,


        engine:
          'google_hotels',


        destination:
          params.destination,


        /* ================================================
           SEARCH
        ================================================ */

        search: {

          destination:
            params.destination,

          check_in:
            params.checkIn,

          check_out:
            params.checkOut,

          rooms:
            params.rooms,

          adults:
            params.adults,

          children:
            params.children,

          babies:
            params.babies,

          seniors:
            params.seniors,

          guests:
            params.guests

        },


        /* ================================================
           FILTERS
        ================================================ */

        filters: {

          min_price:
            params.minPrice,

          max_price:
            params.maxPrice,

          hotel_class:
            params.hotelClass,

          min_rating:
            params.minRating,

          amenities:
            params.amenities,

          free_cancellation:
            params.freeCancellation,

          free_breakfast:
            params.freeBreakfast

        },


        /* ================================================
           SORT
        ================================================ */

        sort:
          params.sort,


        /* ================================================
           RESULTS
        ================================================ */

        results:
          hotels,


        properties:
          hotels,


        hotels:
          hotels,


        count:
          hotels.length,


        page_size:
          MAX_RESULTS_PER_PAGE,


        /* ================================================
           FILTER DEBUG
        ================================================ */

        filter_meta: {

          before:
            beforeFilterCount,

          after:
            afterFilterCount,

          removed:
            beforeFilterCount -
            afterFilterCount

        },


        /* ================================================
           PAGINATION
        ================================================ */

        next_page_token:
          nextPageToken,


        has_more:
          hasNextPage,


        pagination: {

          current:
            serpPagination.current ||
            null,

          current_from:
            serpPagination.current_from ||
            null,

          current_to:
            serpPagination.current_to ||
            null,

          next_page_token:
            nextPageToken,

          has_next_page:
            hasNextPage

        },


        /* ================================================
           META
        ================================================ */

        meta: {

          requested_next_page:
            Boolean(
              params.nextPageToken
            ),

          returned_hotel_count:
            hotels.length,

          serpapi_property_count:
            rawProperties.length,

          serpapi_has_next_page:
            hasNextPage,

          search_id:

            data.search_metadata &&
            data.search_metadata.id

              ? data.search_metadata.id

              : null,

          status:

            data.search_metadata &&
            data.search_metadata.status

              ? data.search_metadata.status

              : null

        },


        /* ================================================
           SERPAPI INFORMATION
        ================================================ */

        serpapi: {

          search_metadata:
            data.search_metadata ||
            null,

          search_parameters:
            data.search_parameters ||
            null,

          serpapi_pagination:
            data.serpapi_pagination ||
            null

        }

      });

  }


  /* =======================================================
     ERROR
  ======================================================= */

  catch (
    error
  ) {

    console.error(
      'BOKKARA HOTEL API ERROR:',
      error
    );


    const isAbort =
      error &&
      error.name ===
        'AbortError';


    return res
      .status(500)
      .json({

        success:
          false,

        error:

          isAbort

            ? 'SerpApi request timed out.'

            : (

                error &&
                error.message

                  ? error.message

                  : 'Unable to retrieve hotel results.'

              )

      });

  }

}
