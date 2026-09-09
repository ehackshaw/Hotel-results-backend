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
    'no-store'
  );

}


/* =========================================================
   HELPERS
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

  const parsed =
    Number(value);

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

  if (Array.isArray(value)) {

    return value;

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
   NORMALIZE AMENITIES
========================================================= */

function normalizeAmenities(hotel) {

  const amenities =
    Array.isArray(
      hotel.amenities
    )
      ? hotel.amenities
      : [];


  return amenities
    .map(
      item =>
        clean(item)
    )
    .filter(Boolean);

}


/* =========================================================
   NORMALIZE IMAGES
========================================================= */

function normalizeImages(hotel) {

  const images = [];


  if (hotel.thumbnail) {

    images.push(
      clean(
        hotel.thumbnail
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
            image.image ||
            image.thumbnail ||
            image.url;


          if (url) {

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
   NORMALIZE PRICE
========================================================= */

function getPrice(hotel) {

  let price = 0;


  if (
    hotel.rate_per_night &&
    hotel.rate_per_night
      .extracted_lowest
  ) {

    price =
      number(
        hotel.rate_per_night
          .extracted_lowest
      );

  }


  if (
    !price &&
    hotel.extracted_price
  ) {

    price =
      number(
        hotel.extracted_price
      );

  }


  if (
    !price &&
    hotel.price
  ) {

    const cleaned =
      String(
        hotel.price
      )
      .replace(
        /[^0-9.]/g,
        ''
      );


    price =
      number(
        cleaned
      );

  }


  return price;

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
    hotel.rate_per_night
      .before_taxes_fees
      ? hotel.rate_per_night
          .before_taxes_fees
      : '';


  const latitude =
    hotel.gps_coordinates &&
    hotel.gps_coordinates.latitude !==
      undefined
      ? number(
          hotel.gps_coordinates
            .latitude
        )
      : null;


  const longitude =
    hotel.gps_coordinates &&
    hotel.gps_coordinates.longitude !==
      undefined
      ? number(
          hotel.gps_coordinates
            .longitude
        )
      : null;


  const propertyToken =
    clean(
      hotel.property_token
    );


  const fallbackId =
    [
      clean(hotel.name),
      clean(hotel.address),
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

    address:
      clean(
        hotel.address
      ),

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
        hotel.link
      ),

    thumbnail:
      clean(
        hotel.thumbnail
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
   FILTER HELPERS
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
    String(
      requestedAmenity
    )
    .toLowerCase();


  return amenities.some(
    amenity =>
      String(
        amenity
      )
      .toLowerCase()
      .includes(
        target
      )
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


    case 'price-low':

      results.sort(
        (a, b) =>
          a.price -
          b.price
      );

      break;


    case 'price-high':

      results.sort(
        (a, b) =>
          b.price -
          a.price
      );

      break;


    case 'rating':

      results.sort(
        (a, b) =>
          b.rating -
          a.rating
      );

      break;


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


  const seniors =
    Math.max(
      0,
      number(
        source.seniors,
        0
      )
    );


  /*
   * IMPORTANT:
   *
   * Accept all of the pagination
   * parameter names used by the
   * frontend/backend.
   */

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
        String(token).trim();


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

  if (
    data &&
    Array.isArray(
      data.properties
    )
  ) {

    return data.properties;

  }


  if (
    data &&
    Array.isArray(
      data.results
    )
  ) {

    return data.results;

  }


  if (
    data &&
    data.data &&
    Array.isArray(
      data.data.properties
    )
  ) {

    return data.data.properties;

  }


  if (
    data &&
    data.data &&
    Array.isArray(
      data.data.results
    )
  ) {

    return data.data.results;

  }


  if (
    data &&
    data.serpapi &&
    Array.isArray(
      data.serpapi.properties
    )
  ) {

    return data.serpapi.properties;

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
      getParams(req);


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
     * Google Hotels returns its
     * own result page size.
     *
     * We still limit the final
     * Shopify response to 20.
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


    /* =====================================================
       PRICE FILTERS
    ===================================================== */

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


    /*
     * Do not log the API key.
     */

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

        nextPage:
          Boolean(
            params.nextPageToken
          )
      }
    );


    /* =====================================================
       FETCH SERPAPI WITH TIMEOUT
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
            method: 'GET',
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
       READ SERPAPI RESPONSE
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
    catch (jsonError) {

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
       SERPAPI HTTP ERROR
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
       SERPAPI API-LEVEL ERROR
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
          (hotel, index) =>
            normalizeHotel(
              hotel,
              index
            )
        )
        .filter(Boolean);


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


    /*
     * A valid token means another
     * page is available.
     */

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

        success: true,

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

          seniors:
            params.seniors

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


        sort:
          params.sort,


        /* ================================================
           HOTEL RESULTS
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
           TOP-LEVEL PAGINATION
           
           IMPORTANT FOR SHOPIFY
        ================================================ */

        next_page_token:
          nextPageToken,

        has_more:
          hasNextPage,


        /* ================================================
           PAGINATION OBJECT
        ================================================ */

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
           DEBUG / SERPAPI INFORMATION
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

  catch (error) {

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

        success: false,

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
