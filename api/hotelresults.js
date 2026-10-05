/**
 * =========================================================
 * BOKKARA HOTEL RESULTS API
 * =========================================================
 *
 * ENDPOINT:
 *   /api/hotelresults
 *
 * ARCHITECTURE:
 *
 *   ONE USER SEARCH
 *        ↓
 *   ONE VERCEL REQUEST
 *        ↓
 *   ONE SERPAPI GOOGLE HOTELS REQUEST
 *        ↓
 *   NORMALIZE
 *        ↓
 *   DEDUPLICATE
 *        ↓
 *   MAX 100 PROPERTIES
 *        ↓
 *   RETURN COMPLETE DATASET
 *
 * NO:
 *   - Infinite scroll
 *   - Pagination
 *   - next_page_token
 *   - property_token detail requests
 *   - additional SerpAPI requests
 *
 * Shopify is responsible for:
 *   - displaying properties
 *   - sorting
 *   - filtering
 *
 * =========================================================
 */

'use strict';


/* =========================================================
   CONFIGURATION
========================================================= */

const SERPAPI_URL =
  'https://serpapi.com/search';


/*
 * Bokkara wants a maximum of 100 properties
 * available to the frontend after ONE search.
 */
const MAX_PROPERTIES = 100;


/*
 * Ask Google Hotels / SerpAPI for a large result set.
 *
 * IMPORTANT:
 * This is a request target, NOT a guarantee.
 *
 * Google Hotels ultimately controls how many properties
 * are returned by a single request.
 */
const SERPAPI_NUM = 100;


/* =========================================================
   BASIC HELPERS
========================================================= */

function firstValue() {

  for (
    let i = 0;
    i < arguments.length;
    i++
  ) {

    const value = arguments[i];

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
      .replace(/[^0-9.-]/g, '');

  const result =
    Number(cleaned);

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
    String(value || '')
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

  return String(value).trim();

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
      .map(function(item) {

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

  return asArray(value)
    .map(function(item) {

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
    .map(function(item) {

      return String(
        item || ''
      ).trim();

    })
    .filter(Boolean);


  return parts.join(', ');

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
        value.match(/([1-5])/);

      if (match) {

        return Number(
          match[1]
        );

      }

    }


    const numeric =
      numberValue(value);


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
        numberValue(price);

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


  images.forEach(function(image) {

    if (
      typeof image === 'string'
    ) {

      const url =
        image.trim();


      if (url) {

        output.push({

          thumbnail: url,
          original_image: url,
          url: url

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

          thumbnail: thumbnail,
          original_image: url,
          url: url || thumbnail

        });

      }

    }

  });


  const standalone =
    firstValue(

      hotel.thumbnail,
      hotel.image,
      hotel.image_url,
      hotel.imageUrl

    );


  if (
    standalone
  ) {

    const exists =
      output.some(function(image) {

        return (
          image.url === standalone ||
          image.thumbnail === standalone ||
          image.original_image === standalone
        );

      });


    if (!exists) {

      output.unshift({

        thumbnail: standalone,
        original_image: standalone,
        url: standalone

      });

    }

  }


  return Array.from(

    new Map(

      output
        .filter(function(image) {

          return Boolean(
            image.url ||
            image.thumbnail ||
            image.original_image
          );

        })
        .map(function(image) {

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
      hotel.coordinates

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
   BREAKFAST
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
    text.includes('free breakfast') ||
    text.includes('breakfast included')
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
    cancellationText.includes('free cancellation') ||
    cancellationText.includes('fully refundable') ||
    cancellationText.includes('refundable')
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

    hotel.place_id,
    hotel.placeId,

    hotel.id,

    /*
     * Fallback.
     */
    'hotel-' + String(index)

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
    extractAddress(hotel);


  const stars =
    extractStars(hotel);


  const rating =
    extractRating(hotel);


  const reviews =
    extractReviews(hotel);


  const amenities =
    Array.from(
      new Set(
        normalizeAmenityList(
          hotel.amenities
        )
      )
    );


  const images =
    extractImages(hotel);


  const nightlyPrice =
    extractNightlyPrice(hotel);


  const totalPrice =
    extractTotalPrice(hotel);


  const beforeTaxes =
    extractBeforeTaxesPrice(hotel);


  const coordinates =
    extractCoordinates(hotel);


  const freeCancellation =
    hasFreeCancellation(hotel);


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

    /* IDENTIFIERS */

    id:
      String(id),

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


    /* BASIC INFORMATION */

    name:
      String(name),

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


    /* STARS */

    stars:
      Number(stars),

    hotel_class:
      Number(stars),

    hotel_class_label:
      stars
        ? String(stars) + '-star hotel'
        : '',


    /* RATINGS */

    rating:
      Number(rating),

    overall_rating:
      Number(rating),

    reviews:
      Number(reviews),

    review_count:
      Number(reviews),


    /* PRICE */

    price:
      Number(nightlyPrice),

    extracted_price:
      Number(nightlyPrice),

    price_per_night:
      Number(nightlyPrice),

    total_price:
      Number(totalPrice),

    extracted_total_price:
      Number(totalPrice),

    before_taxes_fees:
      Number(beforeTaxes),

    currency:
      extractCurrency(hotel),

    price_display:
      nightlyPrice
        ? '$' +
          Number(
            nightlyPrice
          ).toLocaleString('en-US')
        : '',


    /* IMAGES */

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


    /* AMENITIES */

    amenities:
      amenities,

    hotel_amenities:
      amenities,


    /* POLICIES */

    free_cancellation:
      Boolean(freeCancellation),

    freeCancellation:
      Boolean(freeCancellation),

    free_breakfast:
      Boolean(freeBreakfast),

    freeBreakfast:
      Boolean(freeBreakfast),


    /* LOCATION */

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


    /* TIMES */

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


    /* BOOKING */

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


    /* FLAGS */

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


    /* ADDITIONAL */

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
     * Preserve the original Google Hotels object.
     */
    raw:
      hotel

  };

}


/* =========================================================
   EXTRACT PROPERTIES
========================================================= */

function extractProperties(data) {

  if (!data) {

    return [];

  }


  /*
   * Google Hotels normally returns properties.
   *
   * The fallback structures are retained for compatibility.
   */

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
   DEDUPLICATE
========================================================= */

function deduplicateHotels(
  hotels
) {

  const seen =
    new Set();


  const output =
    [];


  hotels.forEach(function(hotel) {

    if (!hotel) {

      return;

    }


    /*
     * Prefer stable Google identifiers.
     */
    const key =
      firstValue(

        hotel.property_token,

        hotel.hotel_id,

        hotel.place_id,

        hotel.id

      );


    /*
     * If there is no identifier, use
     * name + address.
     */
    const fallbackKey =
      (
        String(
          hotel.name || ''
        )
          .toLowerCase()
          .trim()
      ) +
      '|' +
      (
        String(
          hotel.address || ''
        )
          .toLowerCase()
          .trim()
      );


    const normalizedKey =
      String(
        key || fallbackKey
      )
        .toLowerCase()
        .trim();


    if (!normalizedKey) {

      return;

    }


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

  });


  return output;

}


/* =========================================================
   SORT
========================================================= */

function normalizeSort(value) {

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
    ].includes(sort)
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
    ].includes(sort)
  ) {

    return 'price-high';

  }


  if (
    [
      'rating',
      'highest-rating',
      'rating-high'
    ].includes(sort)
  ) {

    return 'rating';

  }


  if (
    [
      'stars',
      'star',
      'hotel-class'
    ].includes(sort)
  ) {

    return 'stars';

  }


  if (
    [
      'reviews',
      'most-reviewed'
    ].includes(sort)
  ) {

    return 'reviews';

  }


  return 'recommended';

}


function sortHotels(
  hotels,
  sort
) {

  const normalized =
    normalizeSort(sort);


  const sorted =
    hotels.slice();


  sorted.sort(function(a, b) {

    if (
      normalized === 'price-low'
    ) {

      return (
        numberValue(a.price) -
        numberValue(b.price)
      );

    }


    if (
      normalized === 'price-high'
    ) {

      return (
        numberValue(b.price) -
        numberValue(a.price)
      );

    }


    if (
      normalized === 'rating'
    ) {

      return (
        numberValue(b.rating) -
        numberValue(a.rating)
      );

    }


    if (
      normalized === 'stars'
    ) {

      return (
        numberValue(b.stars) -
        numberValue(a.stars)
      );

    }


    if (
      normalized === 'reviews'
    ) {

      return (
        numberValue(b.reviews) -
        numberValue(a.reviews)
      );

    }


    /*
     * Recommended:
     *
     * Rating
     * ↓
     * Reviews
     * ↓
     * Price
     */

    const ratingA =
      numberValue(a.rating);

    const ratingB =
      numberValue(b.rating);


    if (
      ratingA !== ratingB
    ) {

      return (
        ratingB -
        ratingA
      );

    }


    const reviewsA =
      numberValue(a.reviews);

    const reviewsB =
      numberValue(b.reviews);


    if (
      reviewsA !== reviewsB
    ) {

      return (
        reviewsB -
        reviewsA
      );

    }


    return (
      numberValue(a.price) -
      numberValue(b.price)
    );

  });


  return sorted;

}


/* =========================================================
   QUERY NORMALIZATION
========================================================= */

function normalizeQuery(req) {

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
     * Filters are retained for frontend compatibility.
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
   SERPAPI PARAMETERS
========================================================= */

function buildSearchParams(query) {

  /*
   * IMPORTANT:
   *
   * There is NO next_page_token here.
   *
   * There is NO pagination.
   *
   * There is NO property_token request.
   */

  return {

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
     * Ask for the largest supported result
     * set in this single request.
     */
    num:
      SERPAPI_NUM,

    /*
     * These do NOT create additional requests.
     */
    deep_search:
      'true',

    show_hidden:
      'true'

  };

}


/* =========================================================
   FETCH SERPAPI
========================================================= */

async function fetchSerpApi(params) {

  const url =
    new URL(
      SERPAPI_URL
    );


  Object.keys(params).forEach(function(key) {

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
      String(value)
    );

  });


  console.log(
    'SERPAPI REQUEST:',
    url.pathname +
    '?' +
    url.searchParams
      .toString()
      .replace(
        /api_key=[^&]+/,
        'api_key=REDACTED'
      )
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
      JSON.parse(text);

  }

  catch (error) {

    throw new Error(
      'SerpAPI returned invalid JSON.'
    );

  }


  if (
    !response.ok
  ) {

    throw new Error(
      firstValue(

        data.error,
        data.message,
        'SerpAPI request failed.'

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

function setCors(res) {

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
   * Do not let browser/CDN cache different searches.
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

  setCors(res);


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
       NORMALIZE SEARCH
    ===================================================== */

    const query =
      normalizeQuery(req);


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
      checkOut <= checkIn
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
       BUILD ONE REQUEST
    ===================================================== */

    const serpParams =
      buildSearchParams(query);


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
      'ONE SERPAPI REQUEST'
    );

    console.log(
      'TARGET:',
      MAX_PROPERTIES
    );

    console.log(
      '================================================='
    );


    /* =====================================================
       ONE — AND ONLY ONE — SERPAPI REQUEST
    ===================================================== */

    const data =
      await fetchSerpApi(
        serpParams
      );


    /* =====================================================
       EXTRACT RAW PROPERTIES
    ===================================================== */

    const rawProperties =
      extractProperties(data);


    console.log(
      'SERPAPI RAW PROPERTY COUNT:',
      rawProperties.length
    );


    /* =====================================================
       NORMALIZE
    ===================================================== */

    let hotels =
      rawProperties.map(
        function(
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
       DEDUPLICATE
    ===================================================== */

    const beforeDeduplication =
      hotels.length;


    hotels =
      deduplicateHotels(
        hotels
      );


    const duplicatesRemoved =
      beforeDeduplication -
      hotels.length;


    console.log(
      'DUPLICATES REMOVED:',
      duplicatesRemoved
    );


    /* =====================================================
       CAP AT 100
    ===================================================== */

    if (
      hotels.length >
      MAX_PROPERTIES
    ) {

      hotels =
        hotels.slice(
          0,
          MAX_PROPERTIES
        );

    }


    /* =====================================================
       SORT
    ===================================================== */

    hotels =
      sortHotels(
        hotels,
        query.sort
      );


    /* =====================================================
       COUNTS
    ===================================================== */

    const hotelsWithPrices =
      hotels.filter(function(hotel) {

        return (
          numberValue(
            hotel.price
          ) > 0
        );

      }).length;


    const hotelsWithImages =
      hotels.filter(function(hotel) {

        return (
          Array.isArray(
            hotel.images
          ) &&
          hotel.images.length > 0
        );

      }).length;


    const hotelsWithRatings =
      hotels.filter(function(hotel) {

        return (
          numberValue(
            hotel.rating
          ) > 0
        );

      }).length;


    /* =====================================================
       IMPORTANT
       NO PAGINATION
    ===================================================== */

    const hasMore =
      false;


    const nextPageToken =
      null;


    /* =====================================================
       RESPONSE
    ===================================================== */

    return res
      .status(200)
      .json({

        success:
          true,


        /*
         * COMPLETE DATASET
         */
        hotels:
          hotels,

        properties:
          hotels,

        results:
          hotels,


        /*
         * ABSOLUTELY NO PAGINATION
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

            enabled:
              false,

            next_page_token:
              null,

            has_more:
              false

          },


        /*
         * SEARCH INFORMATION
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
         * FILTER INFORMATION
         *
         * Frontend can apply these locally.
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


        sort:
          query.sort,


        /*
         * CACHE INFORMATION
         */
        cache:
          {

            client_side_filtering:
              true,

            client_side_sorting:
              true,

            pagination:
              false,

            infinite_scroll:
              false,

            server_pagination:
              false,

            browser_session:
              true

          },


        /*
         * VERY IMPORTANT DEBUG INFORMATION
         */
        meta:
          {

            requested_property_count:
              MAX_PROPERTIES,

            serpapi_requested_count:
              SERPAPI_NUM,

            serpapi_property_count:
              rawProperties.length,

            deduplicated_property_count:
              hotels.length,

            returned_property_count:
              hotels.length,

            duplicates_removed:
              duplicatesRemoved,

            hotels_with_price:
              hotelsWithPrices,

            hotels_with_image:
              hotelsWithImages,

            hotels_with_rating:
              hotelsWithRatings,

            serpapi_requests_made:
              1,

            property_detail_requests_made:
              0,

            pagination_requests_made:
              0,

            infinite_scroll_requests_made:
              0

          },


        /*
         * SERPAPI PAGINATION METADATA IS RETURNED ONLY
         * FOR DEBUGGING.
         *
         * Bokkara DOES NOT use it.
         */
        serpapi_pagination:
          data.serpapi_pagination ||
          null

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
