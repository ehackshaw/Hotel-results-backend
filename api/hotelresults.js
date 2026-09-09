/**
 * =========================================================
 * BOKKARA HOTEL RESULTS API
 * =========================================================
 *
 * SERPAPI:
 * Google Hotels
 *
 * ENDPOINT:
 * https://serpapi.com/search?engine=google_hotels
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
    'no-store'
  );
}


/* =========================================================
   HELPERS
========================================================= */

function clean(value) {

  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();

}


function number(value, fallback = 0) {

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;

}


function boolean(value) {

  if (
    value === true ||
    value === 'true' ||
    value === '1'
  ) {
    return true;
  }

  return false;

}


function arrayFrom(value) {

  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map(item => item.trim())
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
   NORMALIZE AMENITIES
========================================================= */

function normalizeAmenities(hotel) {

  const amenities = Array.isArray(
    hotel.amenities
  )
    ? hotel.amenities
    : [];

  return amenities
    .map(item => clean(item))
    .filter(Boolean);

}


/* =========================================================
   NORMALIZE IMAGES
========================================================= */

function normalizeImages(hotel) {

  const images = [];

  if (hotel.thumbnail) {
    images.push(
      clean(hotel.thumbnail)
    );
  }

  if (Array.isArray(hotel.images)) {

    hotel.images.forEach(image => {

      if (typeof image === 'string') {

        if (image.trim()) {
          images.push(image.trim());
        }

        return;

      }

      if (
        image &&
        typeof image === 'object'
      ) {

        const url =
          image.original_image ||
          image.image ||
          image.thumbnail ||
          image.url;

        if (url) {
          images.push(
            String(url).trim()
          );
        }

      }

    });

  }


  return [
    ...new Set(
      images.filter(Boolean)
    )
  ];

}


/* =========================================================
   NORMALIZE PRICE
========================================================= */

function getPrice(hotel) {

  let price = 0;

  if (
    hotel.rate_per_night &&
    hotel.rate_per_night.extracted_lowest
  ) {

    price = number(
      hotel.rate_per_night.extracted_lowest
    );

  }


  if (
    !price &&
    hotel.extracted_price
  ) {

    price = number(
      hotel.extracted_price
    );

  }


  if (
    !price &&
    hotel.price
  ) {

    const cleaned =
      String(hotel.price)
        .replace(/[^0-9.]/g, '');

    price = number(
      cleaned
    );

  }


  return price;

}


/* =========================================================
   NORMALIZE HOTEL
========================================================= */

function normalizeHotel(hotel, index) {

  const amenities =
    normalizeAmenities(hotel);

  const images =
    normalizeImages(hotel);

  const price =
    getPrice(hotel);

  const rating =
    number(
      hotel.overall_rating,
      0
    );

  const reviews =
    number(
      hotel.reviews,
      0
    );

  const stars =
    number(
      hotel.hotel_class,
      0
    );


  const lowestPrice =
    hotel.rate_per_night &&
    hotel.rate_per_night.lowest
      ? hotel.rate_per_night.lowest
      : (
          price
            ? `US$${price}`
            : ''
        );


  const beforeTaxes =
    hotel.rate_per_night &&
    hotel.rate_per_night.before_taxes_fees
      ? hotel.rate_per_night.before_taxes_fees
      : '';


  const latitude =
    hotel.gps_coordinates &&
    hotel.gps_coordinates.latitude
      ? number(
          hotel.gps_coordinates.latitude
        )
      : null;


  const longitude =
    hotel.gps_coordinates &&
    hotel.gps_coordinates.longitude
      ? number(
          hotel.gps_coordinates.longitude
        )
      : null;


  return {

    id:
      hotel.property_token ||
      `hotel-${index}`,

    property_token:
      hotel.property_token ||
      null,

    name:
      clean(hotel.name),

    type:
      clean(hotel.type) ||
      'hotel',

    description:
      clean(hotel.description),

    address:
      clean(hotel.address),

    neighborhood:
      clean(hotel.neighborhood),

    city:
      clean(hotel.city),

    country:
      clean(hotel.country),

    phone:
      clean(hotel.phone),

    website:
      clean(hotel.link),

    thumbnail:
      clean(hotel.thumbnail),

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
      lowestPrice,

    lowest_price:
      lowestPrice,

    before_taxes_fees:
      beforeTaxes,

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
      hotel.gps_coordinates || null,

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

    raw: hotel

  };

}


/* =========================================================
   FILTER HELPERS
========================================================= */

function hotelHasAmenity(
  hotel,
  requestedAmenity
) {

  const amenities =
    hotel.amenities.map(
      item =>
        String(item).toLowerCase()
    );

  const target =
    String(
      requestedAmenity
    ).toLowerCase();


  return amenities.some(
    amenity =>
      amenity.includes(target)
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


  /* PRICE */

  if (
    filters.min_price !== null
  ) {

    results =
      results.filter(
        hotel =>
          hotel.price >=
          filters.min_price
      );

  }


  if (
    filters.max_price !== null
  ) {

    results =
      results.filter(
        hotel =>
          hotel.price <=
          filters.max_price
      );

  }


  /* STAR RATING */

  if (
    filters.hotel_class !== null
  ) {

    results =
      results.filter(
        hotel =>
          hotel.stars >=
          filters.hotel_class
      );

  }


  /* GUEST RATING */

  if (
    filters.min_rating !== null
  ) {

    results =
      results.filter(
        hotel =>
          hotel.rating >=
          filters.min_rating
      );

  }


  /* AMENITIES */

  if (
    filters.amenities.length
  ) {

    results =
      results.filter(
        hotel =>

          filters.amenities.every(
            amenity =>
              hotelHasAmenity(
                hotel,
                amenity
              )
          )

      );

  }


  /* FREE CANCELLATION */

  if (
    filters.free_cancellation
  ) {

    results =
      results.filter(
        hotel =>
          hotel.free_cancellation
      );

  }


  /* FREE BREAKFAST */

  if (
    filters.free_breakfast
  ) {

    results =
      results.filter(
        hotel =>
          hotel.free_breakfast
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


  switch (sort) {


    /* PRICE LOW */

    case 'price-low':

      results.sort(
        (a, b) =>
          a.price - b.price
      );

      break;


    /* PRICE HIGH */

    case 'price-high':

      results.sort(
        (a, b) =>
          b.price - a.price
      );

      break;


    /* RATING */

    case 'rating':

      results.sort(
        (a, b) =>
          b.rating - a.rating
      );

      break;


    /* STARS */

    case 'stars':

      results.sort(
        (a, b) => {

          if (
            b.stars !==
            a.stars
          ) {

            return (
              b.stars -
              a.stars
            );

          }

          return (
            b.rating -
            a.rating
          );

        }
      );

      break;


    /* RECOMMENDED */

    case 'recommended':

    default:

      results.sort(
        (a, b) => {

          const aScore =
            (
              a.rating * 10
            ) +
            (
              a.stars * 2
            ) +
            (
              a.free_cancellation
                ? 1
                : 0
            );

          const bScore =
            (
              b.rating * 10
            ) +
            (
              b.stars * 2
            ) +
            (
              b.free_cancellation
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
   GET PARAMETERS
========================================================= */

function getParams(req) {

  const source =
    req.method === 'POST'
      ? (
          req.body &&
          typeof req.body === 'object'
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


  const seniors =
    Math.max(
      0,
      number(
        source.seniors,
        0
      )
    );


  const nextPageToken =
    clean(
      source.next_page_token ||
      source.page_token ||
      ''
    );


  const sort =
    clean(
      source.sort ||
      'recommended'
    );


  const minPrice =
    source.min_price !== undefined &&
    source.min_price !== ''
      ? number(
          source.min_price
        )
      : null;


  const maxPrice =
    source.max_price !== undefined &&
    source.max_price !== ''
      ? number(
          source.max_price
        )
      : null;


  const hotelClass =
    source.hotel_class !== undefined &&
    source.hotel_class !== ''
      ? number(
          source.hotel_class
        )
      : null;


  const minRating =
    source.min_rating !== undefined &&
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

    seniors,

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
   API HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  setCors(res);


  /* OPTIONS */

  if (
    req.method === 'OPTIONS'
  ) {

    return res
      .status(200)
      .end();

  }


  /* METHOD */

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


  /* API KEY */

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
      getParams(req);


    /* DATE VALIDATION */

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
       SERPAPI REQUEST
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
        params.adults
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
     * SerpApi's Google Hotels response
     * provides up to 20 properties on
     * a result page.
     */

    serpParams.set(
      'num',
      '20'
    );


    /*
     * Pagination
     */

    if (
      params.nextPageToken
    ) {

      serpParams.set(
        'next_page_token',
        params.nextPageToken
      );

    }


    /*
     * SerpApi native price filters.
     *
     * These reduce unnecessary
     * properties before we normalize.
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


    const url =
      `${SERPAPI_URL}?${serpParams.toString()}`;


    /* =====================================================
       FETCH SERPAPI
    ===================================================== */

    const response =
      await fetch(url);


    const data =
      await response.json();


    if (
      !response.ok
    ) {

      return res
        .status(
          response.status
        )
        .json({

          success: false,

          error:
            data.error ||
            'SerpApi request failed.',

          serpapi:
            data

        });

    }


    if (
      data.error
    ) {

      return res
        .status(400)
        .json({

          success: false,

          error:
            data.error,

          serpapi:
            data

        });

    }


    /* =====================================================
       NORMALIZE PROPERTIES
    ===================================================== */

    const rawProperties =
      Array.isArray(
        data.properties
      )
        ? data.properties
        : [];


    let hotels =
      rawProperties.map(
        (hotel, index) =>
          normalizeHotel(
            hotel,
            index
          )
      );


    /* =====================================================
       FILTER
    ===================================================== */

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


    /* =====================================================
       SORT
    ===================================================== */

    hotels =
      sortHotels(
        hotels,
        params.sort
      );


    /*
     * Always expose a maximum
     * of 20 cards to Shopify.
     */

    hotels =
      hotels.slice(
        0,
        20
      );


    /* =====================================================
       PAGINATION
    ===================================================== */

    const pagination =
      data.serpapi_pagination ||
      {};


    const nextPageToken =
      clean(
        pagination.next_page_token
      ) || null;


    /*
     * SerpApi does not require us
     * to maintain a server-side
     * session.
     *
     * Shopify stores the token
     * for each page.
     */

    const hasNextPage =
      Boolean(
        nextPageToken
      );


    /* =====================================================
       RESPONSE
    ===================================================== */

    return res
      .status(200)
      .json({

        success: true,

        engine:
          'google_hotels',

        destination:
          params.destination,

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

          seniors:
            params.seniors

        },

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

        sort:
          params.sort,

        results: hotels,

        properties:
          hotels,

        count:
          hotels.length,

        page_size:
          20,

        pagination: {

          current:
            pagination.current ||
            null,

          current_from:
            pagination.current_from ||
            null,

          current_to:
            pagination.current_to ||
            null,

          next_page_token:
            nextPageToken,

          has_next_page:
            hasNextPage

        },

        serpapi: {

          search_metadata:
            data.search_metadata ||
            null,

          search_parameters:
            data.search_parameters ||
            null

        }

      });

  }

  catch (error) {

    console.error(
      'BOKKARA HOTEL API ERROR:',
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        error:
          error.message ||
          'Unable to retrieve hotel results.'

      });

  }

}
