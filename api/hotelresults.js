/**
 * =========================================================
 * BOKKARA HOTEL RESULTS API
 * =========================================================
 *
 * ENDPOINT:
 *   /api/hotelresults
 *
 * SERPAPI:
 *   Google Hotels
 *
 * ENVIRONMENT VARIABLE:
 *   SERPAPI_API_KEY
 *
 * =========================================================
 *
 * NEW ARCHITECTURE
 * =========================================================
 *
 * ONE USER SEARCH
 *      ↓
 * ONE VERCEL REQUEST
 *      ↓
 * ONE SERPAPI REQUEST
 *      ↓
 * CLEAN / NORMALIZE / DEDUPLICATE
 *      ↓
 * RETURN ALL USABLE HOTELS
 *      ↓
 * SHOPIFY SESSION STORAGE
 *
 * After that:
 *
 * SCROLL       = NO API CALL
 * SORT         = NO API CALL
 * FILTER       = NO API CALL
 * PAGINATION   = NO API CALL
 *
 * =========================================================
 *
 * IMPORTANT:
 *
 * We intentionally DO NOT perform property_token
 * detail lookups.
 *
 * Every additional property-token lookup would be another
 * SerpAPI request and would defeat the one-call architecture.
 *
 * =========================================================
 */

'use strict';


/* =========================================================
   CONFIG
========================================================= */

const SERPAPI_URL =
  'https://serpapi.com/search';


/*
 * Bokkara target.
 *
 * This is the maximum number of usable properties we want
 * the frontend to be capable of storing.
 *
 * SerpAPI itself may impose a lower per-request limit.
 *
 * We NEVER paginate behind the scenes because that would
 * create additional API charges.
 */

const BOKKARA_MAX_PROPERTIES = 600;


/*
 * Practical Google Hotels request size.
 *
 * IMPORTANT:
 *
 * Do not change this to 600 expecting SerpAPI to guarantee
 * 600 properties in one request.
 *
 * SerpAPI / Google Hotels controls the actual maximum.
 *
 * We request a large result set in the SINGLE request and
 * return everything that Google Hotels supplies.
 */

const SERPAPI_NUM =
  100;


/*
 * Maximum payload protection.
 *
 * If SerpAPI ever returns more than the requested amount,
 * we still cap what Bokkara sends to the browser.
 */

const MAX_RETURNED_PROPERTIES =
  BOKKARA_MAX_PROPERTIES;


/* =========================================================
   BASIC HELPERS
========================================================= */

function firstValue() {

  for (
    let i = 0;
    i < arguments.length;
    i++
  ) {

    const value =
      arguments[i];

    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {

      return value;

    }

  }

  return '';

}


function numberValue(value) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    return 0;

  }


  if (
    typeof value === 'number'
  ) {

    return Number.isFinite(value)
      ? value
      : 0;

  }


  const cleaned =
    String(value)
      .replace(
        /[^0-9.-]/g,
        ''
      );


  const result =
    Number(
      cleaned
    );


  return Number.isFinite(result)
    ? result
    : 0;

}


function booleanValue(value) {

  if (
    value === true ||
    value === false
  ) {

    return value;

  }


  const normalized =
    String(
      value || ''
    )
      .trim()
      .toLowerCase();


  return (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'y'
  );

}


function stringValue(value) {

  if (
    value === undefined ||
    value === null
  ) {

    return '';

  }


  return String(
    value
  ).trim();

}


/* =========================================================
   ARRAY HELPERS
========================================================= */

function asArray(value) {

  if (
    Array.isArray(value)
  ) {

    return value;

  }


  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    return [];

  }


  if (
    typeof value === 'string'
  ) {

    return value
      .split(',')
      .map(function (item) {

        return item.trim();

      })
      .filter(Boolean);

  }


  if (
    typeof value === 'object'
  ) {

    return Object.values(value)
      .flat()
      .filter(Boolean);

  }


  return [];

}


function normalizeAmenityList(value) {

  return asArray(
    value
  )
    .map(function (item) {

      if (
        typeof item === 'string'
      ) {

        return item.trim();

      }


      if (
        item &&
        typeof item === 'object'
      ) {

        return firstValue(

          item.name,

          item.title,

          item.label,

          item.description,

          item.text

        );

      }


      return '';

    })
    .filter(Boolean);

}


/* =========================================================
   ADDRESS
========================================================= */

function extractAddress(hotel) {

  if (!hotel) {

    return '';

  }


  const direct =
    firstValue(

      hotel.address,

      hotel.property_address,

      hotel.propertyAddress,

      hotel.hotel_address,

      hotel.hotelAddress,

      hotel.formatted_address,

      hotel.formattedAddress,

      hotel.full_address,

      hotel.fullAddress,

      hotel.street_address,

      hotel.streetAddress

    );


  if (
    typeof direct === 'string' &&
    direct.trim()
  ) {

    return direct.trim();

  }


  if (
    direct &&
    typeof direct === 'object'
  ) {

    const objectAddress =
      firstValue(

        direct.formatted_address,

        direct.formattedAddress,

        direct.full_address,

        direct.fullAddress,

        direct.street,

        direct.line1,

        direct.address

      );


    if (objectAddress) {

      return String(
        objectAddress
      ).trim();

    }

  }


  const location =
    hotel.location;


  if (
    location &&
    typeof location === 'object'
  ) {

    const nested =
      firstValue(

        location.address,

        location.formatted_address,

        location.formattedAddress,

        location.full_address,

        location.fullAddress,

        location.street_address,

        location.streetAddress

      );


    if (nested) {

      return String(
        nested
      ).trim();

    }

  }


  const parts = [

    firstValue(
      hotel.street,
      hotel.street_name,
      hotel.streetName
    ),

    firstValue(
      hotel.city,
      hotel.locality
    ),

    firstValue(
      hotel.state,
      hotel.region,
      hotel.province
    ),

    firstValue(
      hotel.postal_code,
      hotel.postalCode,
      hotel.zip
    ),

    firstValue(
      hotel.country,
      hotel.country_name,
      hotel.countryName
    )

  ]
    .map(function (item) {

      return String(
        item || ''
      ).trim();

    })
    .filter(Boolean);


  return parts.join(
    ', '
  );

}


/* =========================================================
   STARS
========================================================= */

function extractStars(hotel) {

  if (!hotel) {

    return 0;

  }


  const extracted =
    numberValue(
      firstValue(

        hotel.extracted_hotel_class,

        hotel.extractedHotelClass

      )
    );


  if (
    extracted >= 1 &&
    extracted <= 5
  ) {

    return extracted;

  }


  const candidates = [

    hotel.hotel_class,

    hotel.hotelClass,

    hotel.stars,

    hotel.star_rating,

    hotel.starRating,

    hotel.hotel_star_rating,

    hotel.hotelStarRating

  ];


  for (
    let i = 0;
    i < candidates.length;
    i++
  ) {

    const value =
      candidates[i];


    if (
      typeof value === 'string'
    ) {

      const match =
        value.match(
          /([1-5])/
        );


      if (match) {

        return Number(
          match[1]
        );

      }

    }


    const numeric =
      numberValue(
        value
      );


    if (
      numeric >= 1 &&
      numeric <= 5
    ) {

      return numeric;

    }

  }


  return 0;

}


/* =========================================================
   RATING
========================================================= */

function extractRating(hotel) {

  if (!hotel) {

    return 0;

  }


  return numberValue(
    firstValue(

      hotel.overall_rating,

      hotel.overallRating,

      hotel.rating,

      hotel.guest_rating,

      hotel.guestRating,

      hotel.extracted_rating,

      hotel.extractedRating

    )
  );

}


/* =========================================================
   REVIEWS
========================================================= */

function extractReviews(hotel) {

  if (!hotel) {

    return 0;

  }


  return numberValue(
    firstValue(

      hotel.reviews,

      hotel.review_count,

      hotel.reviewCount,

      hotel.total_reviews,

      hotel.totalReviews,

      hotel.reviews_count,

      hotel.reviewsCount

    )
  );

}


/* =========================================================
   PRICE
========================================================= */

function extractNightlyPrice(hotel) {

  if (!hotel) {

    return 0;

  }


  const rate =
    hotel.rate_per_night &&
    typeof hotel.rate_per_night === 'object'
      ? hotel.rate_per_night
      : {};


  const totalRate =
    hotel.total_rate &&
    typeof hotel.total_rate === 'object'
      ? hotel.total_rate
      : {};


  const priceObject =
    hotel.price &&
    typeof hotel.price === 'object'
      ? hotel.price
      : {};


  /*
   * Standard Google Hotels fields.
   */

  const standardPrice =
    numberValue(
      firstValue(

        rate.extracted_lowest,

        rate.extractedLowest,

        hotel.extracted_price,

        hotel.extractedPrice,

        hotel.price_per_night,

        hotel.pricePerNight,

        priceObject.extracted_lowest,

        priceObject.extractedLowest,

        priceObject.extracted_price,

        priceObject.extractedPrice,

        priceObject.amount,

        priceObject.value

      )
    );


  if (
    standardPrice > 0
  ) {

    return standardPrice;

  }


  /*
   * Look through price arrays when available.
   */

  const prices =
    asArray(
      hotel.prices
    );


  for (
    let i = 0;
    i < prices.length;
    i++
  ) {

    const price =
      prices[i];


    if (
      typeof price === 'number'
    ) {

      const numeric =
        numberValue(
          price
        );


      if (
        numeric > 0
      ) {

        return numeric;

      }

    }


    if (
      price &&
      typeof price === 'object'
    ) {

      const numeric =
        numberValue(
          firstValue(

            price.extracted_price,

            price.extractedPrice,

            price.amount,

            price.value,

            price.price,

            price.rate,

            price.extracted_rate

          )
        );


      if (
        numeric > 0
      ) {

        return numeric;

      }

    }

  }


  /*
   * Fallback fields.
   */

  return numberValue(
    firstValue(

      totalRate.extracted_lowest,

      totalRate.extractedLowest,

      totalRate.lowest,

      hotel.total_price,

      hotel.totalPrice,

      hotel.extracted_total_price,

      hotel.extractedTotalPrice,

      hotel.rate,

      hotel.price

    )
  );

}


/* =========================================================
   TOTAL PRICE
========================================================= */

function extractTotalPrice(hotel) {

  if (!hotel) {

    return 0;

  }


  const totalRate =
    hotel.total_rate &&
    typeof hotel.total_rate === 'object'
      ? hotel.total_rate
      : {};


  return numberValue(
    firstValue(

      totalRate.extracted_lowest,

      totalRate.extractedLowest,

      totalRate.lowest,

      hotel.total_price,

      hotel.totalPrice,

      hotel.extracted_total_price,

      hotel.extractedTotalPrice

    )
  );

}


/* =========================================================
   BEFORE TAXES
========================================================= */

function extractBeforeTaxesPrice(hotel) {

  if (!hotel) {

    return 0;

  }


  const rate =
    hotel.rate_per_night &&
    typeof hotel.rate_per_night === 'object'
      ? hotel.rate_per_night
      : {};


  const totalRate =
    hotel.total_rate &&
    typeof hotel.total_rate === 'object'
      ? hotel.total_rate
      : {};


  return numberValue(
    firstValue(

      rate.extracted_before_taxes_fees,

      rate.extractedBeforeTaxesFees,

      totalRate.extracted_before_taxes_fees,

      totalRate.extractedBeforeTaxesFees,

      hotel.extracted_before_taxes_fees,

      hotel.extractedBeforeTaxesFees

    )
  );

}


/* =========================================================
   CURRENCY
========================================================= */

function extractCurrency(hotel) {

  if (!hotel) {

    return 'USD';

  }


  const rate =
    hotel.rate_per_night &&
    typeof hotel.rate_per_night === 'object'
      ? hotel.rate_per_night
      : {};


  const totalRate =
    hotel.total_rate &&
    typeof hotel.total_rate === 'object'
      ? hotel.total_rate
      : {};


  return firstValue(

    hotel.currency,

    rate.currency,

    totalRate.currency,

    'USD'

  );

}


/* =========================================================
   IMAGES
========================================================= */

function extractImages(hotel) {

  if (!hotel) {

    return [];

  }


  const output = [];


  const images =
    asArray(
      hotel.images
    );


  images.forEach(
    function (image) {

      if (
        typeof image === 'string'
      ) {

        const url =
          image.trim();


        if (url) {

          output.push({

            thumbnail:
              url,

            original_image:
              url,

            url:
              url

          });

        }


        return;

      }


      if (
        image &&
        typeof image === 'object'
      ) {

        const url =
          firstValue(

            image.original_image,

            image.originalImage,

            image.url,

            image.image,

            image.thumbnail

          );


        const thumbnail =
          firstValue(

            image.thumbnail,

            image.url,

            image.image,

            image.original_image

          );


        if (
          url ||
          thumbnail
        ) {

          output.push({

            thumbnail:
              thumbnail,

            original_image:
              url,

            url:
              url ||
              thumbnail

          });

        }

      }

    }
  );


  /*
   * Standalone image fields.
   */

  const standalone =
    firstValue(

      hotel.thumbnail,

      hotel.image,

      hotel.image_url,

      hotel.imageUrl

    );


  if (
    standalone &&
    !output.some(
      function (image) {

        return (
          image.url ===
            standalone ||

          image.thumbnail ===
            standalone
        );

      }
    )
  ) {

    output.unshift({

      thumbnail:
        standalone,

      original_image:
        standalone,

      url:
        standalone

    });

  }


  /*
   * Deduplicate images.
   */

  return Array.from(

    new Map(

      output
        .filter(function (image) {

          return Boolean(
            image.url ||
            image.thumbnail ||
            image.original_image
          );

        })
        .map(function (image) {

          const key =
            firstValue(

              image.url,

              image.original_image,

              image.thumbnail

            );


          return [
            key,
            image
          ];

        })

    ).values()

  );

}


/* =========================================================
   GPS
========================================================= */

function extractCoordinates(hotel) {

  if (!hotel) {

    return {
      latitude: 0,
      longitude: 0
    };

  }


  const gps =
    firstValue(

      hotel.gps_coordinates,

      hotel.gpsCoordinates,

      hotel.coordinates,

      hotel.location

    );


  if (
    gps &&
    typeof gps === 'object'
  ) {

    return {

      latitude:
        numberValue(
          firstValue(

            gps.latitude,

            gps.lat

          )
        ),

      longitude:
        numberValue(
          firstValue(

            gps.longitude,

            gps.lng,

            gps.lon

          )
        )

    };

  }


  return {

    latitude:
      numberValue(
        firstValue(
          hotel.latitude,
          hotel.lat
        )
      ),

    longitude:
      numberValue(
        firstValue(
          hotel.longitude,
          hotel.lng,
          hotel.lon
        )
      )

  };

}


/* =========================================================
   FREE BREAKFAST
========================================================= */

function hasFreeBreakfast(
  hotel,
  amenities
) {

  if (!hotel) {

    return false;

  }


  if (
    hotel.free_breakfast === true ||
    hotel.freeBreakfast === true
  ) {

    return true;

  }


  const text =
    normalizeAmenityList(
      amenities
    )
      .join(' | ')
      .toLowerCase();


  return (
    text.includes(
      'free breakfast'
    ) ||
    text.includes(
      'breakfast included'
    ) ||
    text.includes(
      'breakfast included'
    )
  );

}


/* =========================================================
   FREE CANCELLATION
========================================================= */

function hasFreeCancellation(hotel) {

  if (!hotel) {

    return false;

  }


  if (
    hotel.free_cancellation === true ||
    hotel.freeCancellation === true
  ) {

    return true;

  }


  const cancellationText =
    String(
      firstValue(

        hotel.cancellation,

        hotel.cancellation_policy,

        hotel.cancellationPolicy,

        hotel.rate_per_night &&
          hotel.rate_per_night.cancellation,

        hotel.total_rate &&
          hotel.total_rate.cancellation,

        ''

      )
    )
      .toLowerCase();


  return (
    cancellationText.includes(
      'free cancellation'
    ) ||
    cancellationText.includes(
      'fully refundable'
    ) ||
    cancellationText.includes(
      'refundable'
    )
  );

}


/* =========================================================
   PROPERTY ID
========================================================= */

function extractPropertyId(
  hotel,
  index
) {

  return firstValue(

    hotel.property_token,

    hotel.propertyToken,

    hotel.hotel_id,

    hotel.hotelId,

    hotel.id,

    hotel.place_id,

    hotel.placeId,

    /*
     * Last-resort stable-ish fallback.
     */

    'hotel-' +
      String(index)

  );

}


/* =========================================================
   NORMALIZE HOTEL
========================================================= */

function normalizeHotel(
  hotel,
  index
) {

  const name =
    firstValue(

      hotel.name,

      hotel.hotel_name,

      hotel.hotelName,

      hotel.property_name,

      hotel.propertyName,

      'Hotel'

    );


  const address =
    extractAddress(
      hotel
    );


  const stars =
    extractStars(
      hotel
    );


  const rating =
    extractRating(
      hotel
    );


  const reviews =
    extractReviews(
      hotel
    );


  const amenities =
    Array.from(
      new Set(

        normalizeAmenityList(
          hotel.amenities
        )

      )
    );


  const images =
    extractImages(
      hotel
    );


  const nightlyPrice =
    extractNightlyPrice(
      hotel
    );


  const totalPrice =
    extractTotalPrice(
      hotel
    );


  const beforeTaxes =
    extractBeforeTaxesPrice(
      hotel
    );


  const coordinates =
    extractCoordinates(
      hotel
    );


  const freeCancellation =
    hasFreeCancellation(
      hotel
    );


  const freeBreakfast =
    hasFreeBreakfast(
      hotel,
      amenities
    );


  const propertyToken =
    firstValue(

      hotel.property_token,

      hotel.propertyToken

    );


  const bookingUrl =
    firstValue(

      hotel.serpapi_property_details_link,

      hotel.serpapiPropertyDetailsLink,

      hotel.link,

      hotel.url

    );


  const id =
    extractPropertyId(
      hotel,
      index
    );


  return {

    /* =====================================================
       IDENTIFIERS
    ===================================================== */

    id:
      String(
        id
      ),

    property_token:
      propertyToken,

    hotel_id:
      firstValue(

        hotel.hotel_id,

        hotel.hotelId

      ),

    place_id:
      firstValue(

        hotel.place_id,

        hotel.placeId

      ),


    /* =====================================================
       BASIC INFORMATION
    ===================================================== */

    name:
      String(
        name
      ),

    type:
      firstValue(
        hotel.type,
        'hotel'
      ),

    description:
      firstValue(
        hotel.description,
        ''
      ),

    address:
      address,

    property_address:
      address,

    hotel_address:
      address,

    neighborhood:
      firstValue(
        hotel.neighborhood,
        ''
      ),

    city:
      firstValue(
        hotel.city,
        ''
      ),

    country:
      firstValue(
        hotel.country,
        ''
      ),

    phone:
      firstValue(

        hotel.phone,

        hotel.phone_number,

        ''

      ),

    website:
      firstValue(

        hotel.website,

        ''

      ),


    /* =====================================================
       STARS
    ===================================================== */

    stars:
      Number(
        stars
      ),

    hotel_class:
      Number(
        stars
      ),

    hotel_class_label:
      stars
        ? (
            String(
              stars
            ) +
            '-star hotel'
          )
        : '',


    /* =====================================================
       RATING
    ===================================================== */

    rating:
      Number(
        rating
      ),

    overall_rating:
      Number(
        rating
      ),

    reviews:
      Number(
        reviews
      ),

    review_count:
      Number(
        reviews
      ),


    /* =====================================================
       PRICE
    ===================================================== */

    price:
      Number(
        nightlyPrice
      ),

    extracted_price:
      Number(
        nightlyPrice
      ),

    price_per_night:
      Number(
        nightlyPrice
      ),

    total_price:
      Number(
        totalPrice
      ),

    extracted_total_price:
      Number(
        totalPrice
      ),

    before_taxes_fees:
      Number(
        beforeTaxes
      ),

    currency:
      extractCurrency(
        hotel
      ),

    price_display:
      nightlyPrice
        ? (
            '$' +
            Number(
              nightlyPrice
            ).toLocaleString(
              'en-US'
            )
          )
        : '',


    /* =====================================================
       IMAGES
    ===================================================== */

    image:
      firstValue(

        images[0] &&
          images[0].original_image,

        images[0] &&
          images[0].url,

        images[0] &&
          images[0].thumbnail

      ),

    thumbnail:
      firstValue(

        images[0] &&
          images[0].thumbnail,

        images[0] &&
          images[0].url,

        images[0] &&
          images[0].original_image

      ),

    images:
      images,

    photo_count:
      images.length,

    photoCount:
      images.length,


    /* =====================================================
       AMENITIES
    ===================================================== */

    amenities:
      amenities,

    hotel_amenities:
      amenities,


    /* =====================================================
       POLICIES
    ===================================================== */

    free_cancellation:
      Boolean(
        freeCancellation
      ),

    freeCancellation:
      Boolean(
        freeCancellation
      ),

    free_breakfast:
      Boolean(
        freeBreakfast
      ),

    freeBreakfast:
      Boolean(
        freeBreakfast
      ),


    /* =====================================================
       LOCATION
    ===================================================== */

    latitude:
      coordinates.latitude,

    longitude:
      coordinates.longitude,

    gps_coordinates:
      {
        latitude:
          coordinates.latitude,

        longitude:
          coordinates.longitude
      },


    /* =====================================================
       TIMES
    ===================================================== */

    check_in_time:
      firstValue(

        hotel.check_in_time,

        ''

      ),

    check_out_time:
      firstValue(

        hotel.check_out_time,

        ''

      ),


    /* =====================================================
       BOOKING REFERENCES
    ===================================================== */

    booking_url:
      bookingUrl,

    property_details_link:
      firstValue(

        hotel.serpapi_property_details_link,

        hotel.serpapiPropertyDetailsLink,

        ''

      ),

    serpapi_property_details_link:
      firstValue(

        hotel.serpapi_property_details_link,

        hotel.serpapiPropertyDetailsLink,

        ''

      ),


    /* =====================================================
       FLAGS
    ===================================================== */

    sponsored:
      Boolean(
        hotel.sponsored
      ),

    eco_certified:
      Boolean(
        hotel.eco_certified
      ),

    deal:
      firstValue(

        hotel.deal,

        ''

      ),

    deal_description:
      firstValue(

        hotel.deal_description,

        ''

      ),


    /* =====================================================
       ADDITIONAL DATA
    ===================================================== */

    nearby_places:
      firstValue(

        hotel.nearby_places,

        []

      ),

    ratings:
      firstValue(

        hotel.ratings,

        []

      ),


    /*
     * Keep original Google Hotels property data.
     *
     * This allows the Shopify detail overlay to use
     * additional information without another API call.
     */

    raw:
      hotel

  };

}


/* =========================================================
   EXTRACT PROPERTIES
========================================================= */

function extractProperties(
  data
) {

  if (!data) {

    return [];

  }


  const candidates = [

    data.properties,

    data.hotels,

    data.results,

    data.data &&
      data.data.properties,

    data.data &&
      data.data.hotels,

    data.data &&
      data.data.results

  ];


  for (
    let i = 0;
    i < candidates.length;
    i++
  ) {

    if (
      Array.isArray(
        candidates[i]
      )
    ) {

      return candidates[i];

    }

  }


  return [];

}


/* =========================================================
   QUALITY FILTER
========================================================= */

/*
 * THIS IS THE IMPORTANT PART.
 *
 * Only properties containing:
 *
 *   1. A valid price
 *   2. At least one image
 *   3. A valid rating
 *
 * are returned to Shopify.
 *
 * Therefore Shopify never receives the unwanted cards.
 */

function isUsableHotel(
  hotel
) {

  if (!hotel) {

    return false;

  }


  const price =
    numberValue(
      hotel.price
    );


  const rating =
    numberValue(
      hotel.rating
    );


  const images =
    extractImages(
      hotel
    );


  /*
   * Price required.
   */

  if (
    price <= 0
  ) {

    return false;

  }


  /*
   * Image required.
   */

  if (
    !images.length
  ) {

    return false;

  }


  /*
   * Rating required.
   *
   * Google Hotels ratings are generally positive
   * values such as 4.2, 4.5, etc.
   */

  if (
    rating <= 0
  ) {

    return false;

  }


  return true;

}


/* =========================================================
   DEDUPLICATION
========================================================= */

function deduplicateHotels(
  hotels
) {

  const seen =
    new Set();


  const output =
    [];


  hotels.forEach(
    function (hotel) {

      if (!hotel) {

        return;

      }


      /*
       * Prefer property token.
       */

      const key =
        firstValue(

          hotel.property_token,

          hotel.hotel_id,

          hotel.place_id,

          (
            String(
              hotel.name || ''
            )
              .toLowerCase()
              .trim() +
            '|' +
            String(
              hotel.address || ''
            )
              .toLowerCase()
              .trim()
          )

        );


      if (!key) {

        return;

      }


      const normalizedKey =
        String(
          key
        )
          .toLowerCase()
          .trim();


      if (
        seen.has(
          normalizedKey
        )
      ) {

        return;

      }


      seen.add(
        normalizedKey
      );


      output.push(
        hotel
      );

    }
  );


  return output;

}


/* =========================================================
   NORMALIZE SORT
========================================================= */

function normalizeSort(
  value
) {

  const sort =
    String(
      value || ''
    )
      .trim()
      .toLowerCase();


  if (
    [
      'price-low',
      'price_low',
      'lowest-price',
      'lowest_price',
      'low'
    ].includes(
      sort
    )
  ) {

    return 'price-low';

  }


  if (
    [
      'price-high',
      'price_high',
      'highest-price',
      'highest_price',
      'high'
    ].includes(
      sort
    )
  ) {

    return 'price-high';

  }


  if (
    [
      'rating',
      'highest-rating',
      'rating-high'
    ].includes(
      sort
    )
  ) {

    return 'rating';

  }


  if (
    [
      'stars',
      'star',
      'hotel-class'
    ].includes(
      sort
    )
  ) {

    return 'stars';

  }


  if (
    [
      'reviews',
      'most-reviewed'
    ].includes(
      sort
    )
  ) {

    return 'reviews';

  }


  return 'recommended';

}


/* =========================================================
   SORT HOTELS
========================================================= */

function sortHotels(
  hotels,
  sort
) {

  const normalized =
    normalizeSort(
      sort
    );


  const sorted =
    hotels.slice();


  sorted.sort(
    function (a, b) {

      if (
        normalized ===
        'price-low'
      ) {

        return (
          numberValue(
            a.price
          ) -
          numberValue(
            b.price
          )
        );

      }


      if (
        normalized ===
        'price-high'
      ) {

        return (
          numberValue(
            b.price
          ) -
          numberValue(
            a.price
          )
        );

      }


      if (
        normalized ===
        'rating'
      ) {

        return (
          numberValue(
            b.rating
          ) -
          numberValue(
            a.rating
          )
        );

      }


      if (
        normalized ===
        'stars'
      ) {

        return (
          numberValue(
            b.stars
          ) -
          numberValue(
            a.stars
          )
        );

      }


      if (
        normalized ===
        'reviews'
      ) {

        return (
          numberValue(
            b.reviews
          ) -
          numberValue(
            a.reviews
          )
        );

      }


      /*
       * Recommended.
       *
       * Rating → reviews → price.
       */

      const ratingA =
        numberValue(
          a.rating
        );


      const ratingB =
        numberValue(
          b.rating
        );


      if (
        ratingA !==
        ratingB
      ) {

        return (
          ratingB -
          ratingA
        );

      }


      const reviewsA =
        numberValue(
          a.reviews
        );


      const reviewsB =
        numberValue(
          b.reviews
        );


      if (
        reviewsA !==
        reviewsB
      ) {

        return (
          reviewsB -
          reviewsA
        );

      }


      return (
        numberValue(
          a.price
        ) -
        numberValue(
          b.price
        )
      );

    }
  );


  return sorted;

}


/* =========================================================
   BUILD SERPAPI PARAMETERS
========================================================= */

/*
 * IMPORTANT:
 *
 * This function intentionally contains NO next_page_token.
 *
 * We want ONE SerpAPI request only.
 */

function buildSearchParams(
  query
) {

  const params = {

    engine:
      'google_hotels',

    api_key:
      process.env.SERPAPI_API_KEY,

    q:
      query.destination,

    check_in_date:
      query.check_in_date,

    check_out_date:
      query.check_out_date,

    adults:
      query.adults,

    children:
      query.children,

    currency:
      'USD',

    hl:
      'en',

    gl:
      'us',

    /*
     * Request a large result set in the one request.
     */

    num:
      SERPAPI_NUM,

    /*
     * Ask Google Hotels for a deep result search
     * when supported.
     */

    deep_search:
      'true',

    show_hidden:
      'true'

  };


  /*
   * We deliberately DO NOT send frontend filters
   * to SerpAPI here.
   *
   * Those filters will operate on the cached dataset
   * inside Shopify.
   *
   * This is what prevents additional API calls when
   * users change filters or sorting.
   */


  return params;

}


/* =========================================================
   QUERY NORMALIZATION
========================================================= */

function normalizeQuery(
  req
) {

  const source =
    req.method === 'POST'
      ? (
          req.body &&
          typeof req.body === 'object'
            ? req.body
            : {}
        )
      : (
          req.query || {}
        );


  const destination =
    firstValue(

      source.destination,

      source.q,

      source.location

    );


  const checkInDate =
    firstValue(

      source.check_in_date,

      source.checkin,

      source.check_in

    );


  const checkOutDate =
    firstValue(

      source.check_out_date,

      source.checkout,

      source.check_out

    );


  const rooms =
    Math.max(
      1,
      numberValue(
        firstValue(
          source.rooms,
          1
        )
      )
    );


  const adults =
    Math.max(
      0,
      numberValue(
        firstValue(
          source.adults,
          1
        )
      )
    );


  const children =
    Math.max(
      0,
      numberValue(
        firstValue(
          source.children,
          0
        )
      )
    );


  const babies =
    Math.max(
      0,
      numberValue(
        firstValue(

          source.babies,

          source.infants,

          0

        )
      )
    );


  const seniors =
    Math.max(
      0,
      numberValue(
        firstValue(
          source.seniors,
          0
        )
      )
    );


  const guests =
    Math.max(
      1,
      numberValue(
        firstValue(

          source.guests,

          (
            adults +
            children +
            babies +
            seniors
          ) || 1

        )
      )
    );


  return {

    destination:
      String(
        destination
      ).trim(),


    check_in_date:
      String(
        checkInDate
      ).trim(),


    check_out_date:
      String(
        checkOutDate
      ).trim(),


    rooms:
      rooms,


    adults:
      adults,


    children:
      children,


    babies:
      babies,


    seniors:
      seniors,


    guests:
      guests,


    /*
     * Retained for frontend compatibility.
     *
     * They are NOT sent to SerpAPI.
     */

    min_price:
      numberValue(
        source.min_price
      ),

    max_price:
      numberValue(
        source.max_price
      ),

    hotel_class:
      firstValue(
        source.hotel_class,
        ''
      ),

    min_rating:
      numberValue(
        firstValue(
          source.min_rating,
          source.rating_min
        )
      ),

    amenities:
      firstValue(
        source.amenities,
        ''
      ),

    free_cancellation:
      booleanValue(
        source.free_cancellation
      ),

    free_breakfast:
      booleanValue(
        source.free_breakfast
      ),

    sort:
      normalizeSort(
        source.sort
      )

  };

}


/* =========================================================
   FETCH SERPAPI
========================================================= */

async function fetchSerpApi(
  params
) {

  const url =
    new URL(
      SERPAPI_URL
    );


  Object.keys(
    params
  ).forEach(
    function (key) {

      const value =
        params[key];


      if (
        value === undefined ||
        value === null ||
        value === ''
      ) {

        return;

      }


      url.searchParams.set(
        key,
        String(
          value
        )
      );

    }
  );


  const response =
    await fetch(
      url.toString(),
      {
        method:
          'GET',

        headers:
          {
            'Accept':
              'application/json'
          }
      }
    );


  const text =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(
        text
      );

  }

  catch (error) {

    throw new Error(
      'SerpApi returned invalid JSON.'
    );

  }


  if (
    !response.ok
  ) {

    throw new Error(
      firstValue(

        data.error,

        data.message,

        'SerpApi request failed.'

      )
    );

  }


  if (
    data.error
  ) {

    throw new Error(
      String(
        data.error
      )
    );

  }


  return data;

}


/* =========================================================
   CORS
========================================================= */

function setCors(
  res
) {

  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );


  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,OPTIONS'
  );


  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept'
  );


  /*
   * Do not allow browser/CDN caching of API responses.
   *
   * Shopify itself will cache the returned dataset in
   * sessionStorage.
   */

  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );

}


/* =========================================================
   MAIN HANDLER
========================================================= */

module.exports = async function handler(
  req,
  res
) {

  setCors(
    res
  );


  /* =======================================================
     OPTIONS
  ======================================================= */

  if (
    req.method === 'OPTIONS'
  ) {

    return res
      .status(204)
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

        success:
          false,

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

        success:
          false,

        error:
          'SERPAPI_API_KEY is not configured on Vercel.'

      });

  }


  try {

    /* =====================================================
       NORMALIZE QUERY
    ===================================================== */

    const query =
      normalizeQuery(
        req
      );


    /* =====================================================
       REQUIRED FIELDS
    ===================================================== */

    if (
      !query.destination
    ) {

      return res
        .status(400)
        .json({

          success:
            false,

          error:
            'Missing destination.'

        });

    }


    if (
      !query.check_in_date
    ) {

      return res
        .status(400)
        .json({

          success:
            false,

          error:
            'Missing check_in_date.'

        });

    }


    if (
      !query.check_out_date
    ) {

      return res
        .status(400)
        .json({

          success:
            false,

          error:
            'Missing check_out_date.'

        });

    }


    /* =====================================================
       DATE VALIDATION
    ===================================================== */

    const checkIn =
      new Date(
        query.check_in_date +
        'T00:00:00'
      );


    const checkOut =
      new Date(
        query.check_out_date +
        'T00:00:00'
      );


    if (
      Number.isNaN(
        checkIn.getTime()
      ) ||
      Number.isNaN(
        checkOut.getTime()
      )
    ) {

      return res
        .status(400)
        .json({

          success:
            false,

          error:
            'Dates must use YYYY-MM-DD format.'

        });

    }


    if (
      checkOut <=
      checkIn
    ) {

      return res
        .status(400)
        .json({

          success:
            false,

          error:
            'check_out_date must be after check_in_date.'

        });

    }


    /* =====================================================
       BUILD ONE SERPAPI REQUEST
    ===================================================== */

    const serpParams =
      buildSearchParams(
        query
      );


    console.log(
      '================================================='
    );


    console.log(
      'BOKKARA HOTEL SEARCH'
    );


    console.log(
      'Destination:',
      query.destination
    );


    console.log(
      'Check-in:',
      query.check_in_date
    );


    console.log(
      'Check-out:',
      query.check_out_date
    );


    console.log(
      'Requested properties:',
      BOKKARA_MAX_PROPERTIES
    );


    console.log(
      'SerpApi request size:',
      SERPAPI_NUM
    );


    console.log(
      'IMPORTANT: ONE SERPAPI REQUEST ONLY'
    );


    console.log(
      '================================================='
    );


    /* =====================================================
       ONE — AND ONLY ONE — SERPAPI CALL
    ===================================================== */

    const data =
      await fetchSerpApi(
        serpParams
      );


    /* =====================================================
       RAW PROPERTIES
    ===================================================== */

    const rawProperties =
      extractProperties(
        data
      );


    console.log(
      'Bokkara raw Google Hotels properties:',
      rawProperties.length
    );


    /* =====================================================
       NORMALIZE
    ===================================================== */

    let hotels =
      rawProperties.map(
        function (
          hotel,
          index
        ) {

          return normalizeHotel(
            hotel,
            index
          );

        }
      );


    /* =====================================================
       QUALITY FILTER
    ===================================================== */

    const beforeQualityFilter =
      hotels.length;


    hotels =
      hotels.filter(
        function (hotel) {

          return isUsableHotel(
            hotel
          );

        }
      );


    const removedForQuality =
      beforeQualityFilter -
      hotels.length;


    console.log(
      'Removed without price/image/rating:',
      removedForQuality
    );


    /* =====================================================
       DEDUPLICATE
    ===================================================== */

    const beforeDeduplication =
      hotels.length;


    hotels =
      deduplicateHotels(
        hotels
      );


    const duplicateCount =
      beforeDeduplication -
      hotels.length;


    console.log(
      'Duplicate properties removed:',
      duplicateCount
    );


    /* =====================================================
       CAP RESPONSE
    ===================================================== */

    if (
      hotels.length >
      MAX_RETURNED_PROPERTIES
    ) {

      hotels =
        hotels.slice(
          0,
          MAX_RETURNED_PROPERTIES
        );

    }


    /* =====================================================
       SORT
    ===================================================== */

    /*
     * The frontend can re-sort this complete dataset
     * without another API call.
     *
     * We return it in recommended order by default.
     */

    hotels =
      sortHotels(
        hotels,
        query.sort
      );


    /* =====================================================
       IMPORTANT:
       NO NEXT PAGE
    ===================================================== */

    /*
     * We intentionally do not expose a next_page_token.
     *
     * If Shopify tries to request another page, it would
     * create another SerpAPI request and defeat the new
     * one-call architecture.
     */

    const nextPageToken =
      null;


    const hasMore =
      false;


    /* =====================================================
       QUALITY COUNTS
    ===================================================== */

    const hotelsWithPrices =
      hotels.filter(
        function (hotel) {

          return (
            numberValue(
              hotel.price
            ) > 0
          );

        }
      ).length;


    const hotelsWithImages =
      hotels.filter(
        function (hotel) {

          return (
            Array.isArray(
              hotel.images
            ) &&
            hotel.images.length > 0
          );

        }
      ).length;


    const hotelsWithRatings =
      hotels.filter(
        function (hotel) {

          return (
            numberValue(
              hotel.rating
            ) > 0
          );

        }
      ).length;


    /* =====================================================
       RESPONSE
    ===================================================== */

    return res
      .status(200)
      .json({

        success:
          true,


        /*
         * =================================================
         * COMPLETE HOTEL DATASET
         * =================================================
         *
         * Shopify should save this entire array into
         * sessionStorage.
         */

        hotels:
          hotels,

        properties:
          hotels,

        results:
          hotels,


        /*
         * =================================================
         * NO SERVER PAGINATION
         * =================================================
         */

        next_page_token:
          null,

        nextPageToken:
          null,

        has_more:
          false,

        hasMore:
          false,


        pagination:
          {

            next_page_token:
              null,

            has_more:
              false

          },


        /*
         * =================================================
         * SEARCH
         * =================================================
         */

        search:
          {

            destination:
              query.destination,

            check_in_date:
              query.check_in_date,

            check_out_date:
              query.check_out_date,

            rooms:
              query.rooms,

            adults:
              query.adults,

            children:
              query.children,

            babies:
              query.babies,

            seniors:
              query.seniors,

            guests:
              query.guests

          },


        /*
         * =================================================
         * FILTERS
         * =================================================
         *
         * These are returned for compatibility.
         *
         * Shopify should perform filtering locally against
         * the cached hotels array.
         */

        filters:
          {

            min_price:
              query.min_price ||
              null,

            max_price:
              query.max_price ||
              null,

            hotel_class:
              query.hotel_class ||
              null,

            min_rating:
              query.min_rating ||
              null,

            amenities:
              query.amenities ||
              null,

            free_cancellation:
              query.free_cancellation,

            free_breakfast:
              query.free_breakfast

          },


        /*
         * =================================================
         * SORT
         * =================================================
         */

        sort:
          query.sort,


        /*
         * =================================================
         * CACHE INFORMATION
         * =================================================
         */

        cache:
          {

            recommended:
              true,

            client_side_filtering:
              true,

            client_side_sorting:
              true,

            pagination_in_browser:
              true,

            server_pagination:
              false,

            expires:
              'browser-session'

          },


        /*
         * =================================================
         * RESULT INFORMATION
         * =================================================
         */

        meta:
          {

            /*
             * Requested target.
             */

            requested_property_target:
              BOKKARA_MAX_PROPERTIES,


            /*
             * Actual number Google Hotels supplied.
             */

            serpapi_property_count:
              rawProperties.length,


            /*
             * Final clean dataset.
             */

            returned_property_count:
              hotels.length,


            /*
             * Quality information.
             */

            removed_without_price_image_or_rating:
              removedForQuality,


            duplicates_removed:
              duplicateCount,


            hotels_with_price:
              hotelsWithPrices,


            hotels_with_image:
              hotelsWithImages,


            hotels_with_rating:
              hotelsWithRatings,


            /*
             * API usage.
             */

            serpapi_requests_made:
              1,


            property_detail_requests_made:
              0,


            pagination_requests_made:
              0

          },


        /*
         * =================================================
         * SERPAPI METADATA
         * =================================================
         *
         * Useful for debugging, but the API key itself
         * is never returned.
         */

        serpapi_pagination:
          data.serpapi_pagination ||
          null

      });

  }

  catch (error) {

    console.error(
      'Bokkara hotel-results API error:',
      error
    );


    return res
      .status(500)
      .json({

        success:
          false,

        error:
          error &&
          error.message
            ? error.message
            : 'Hotel API request failed.',

        message:
          error &&
          error.message
            ? error.message
            : 'Hotel API request failed.'

      });

  }

};
