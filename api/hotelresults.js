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
 * OPTIONAL:
 *   No Google Places key is required for the address lookup.
 *
 * IMPORTANT:
 *   Google Hotels search results provide:
 *     - name
 *     - hotel_class / extracted_hotel_class
 *     - overall_rating
 *     - reviews
 *     - images
 *     - amenities
 *     - prices
 *     - property_token
 *
 *   Property details are used when the search result does not
 *   contain an address.
 *
 * =========================================================
 */

'use strict';


/* =========================================================
   CONFIG
========================================================= */

const SERPAPI_URL =
  'https://serpapi.com/search';

const MAX_RESULTS_PER_PAGE = 20;

/*
 * Maximum number of property-detail lookups happening at
 * the same time.
 *
 * This prevents sending 20 simultaneous requests to SerpApi.
 */
const DETAIL_CONCURRENCY = 5;


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

  return asArray(value)
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

          item.description

        );

      }


      return '';

    })
    .filter(Boolean);

}


/* =========================================================
   ADDRESS EXTRACTION
========================================================= */

function extractAddress(hotel) {

  if (!hotel) {

    return '';

  }


  /*
   * Direct fields.
   */

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


  if (direct) {

    return String(direct).trim();

  }


  /*
   * Nested location structures.
   */

  const nestedLocation =
    hotel.location;


  if (
    nestedLocation &&
    typeof nestedLocation === 'object'
  ) {

    const nested =
      firstValue(

        nestedLocation.address,

        nestedLocation.formatted_address,

        nestedLocation.formattedAddress,

        nestedLocation.full_address,

        nestedLocation.fullAddress,

        nestedLocation.street_address,

        nestedLocation.streetAddress,

        nestedLocation.name

      );


    if (nested) {

      return String(nested).trim();

    }

  }


  /*
   * Address object.
   */

  if (
    hotel.address &&
    typeof hotel.address === 'object'
  ) {

    const addressObject =
      hotel.address;


    const objectAddress =
      firstValue(

        addressObject.formatted_address,

        addressObject.formattedAddress,

        addressObject.full_address,

        addressObject.street,

        addressObject.line1,

        addressObject.address

      );


    if (objectAddress) {

      return String(objectAddress).trim();

    }

  }


  /*
   * Some sources return address pieces instead of
   * a single address string.
   */

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

      return String(item || '').trim();

    })
    .filter(Boolean);


  if (parts.length) {

    return parts.join(', ');

  }


  return '';

}


/* =========================================================
   HOTEL CLASS / STARS
========================================================= */

function extractStars(hotel) {

  if (!hotel) {

    return 0;

  }


  /*
   * SerpApi's documented Google Hotels field.
   *
   * This is the preferred value.
   */

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


  /*
   * Other possible fields.
   */

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

      hotel.guestRating

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


  return numberValue(
    firstValue(

      rate.extracted_lowest,

      rate.extractedLowest,

      hotel.extracted_price,

      hotel.extractedPrice,

      hotel.price_per_night,

      hotel.pricePerNight,

      priceObject.extracted_lowest,

      priceObject.extracted_price,

      priceObject.amount,

      priceObject.value,

      priceObject.price,

      /*
       * Total price is intentionally after nightly price.
       */

      totalRate.extracted_lowest,

      totalRate.extractedLowest,

      hotel.total_price,

      hotel.totalPrice,

      totalRate.lowest,

      rate.lowest,

      hotel.price,

      hotel.rate

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

      hotel.total_price,

      hotel.totalPrice,

      hotel.extracted_total_price,

      hotel.extractedTotalPrice

    )
  );

}


/* =========================================================
   BEFORE-TAX PRICE
========================================================= */

function extractBeforeTaxesPrice(hotel) {

  const rate =
    hotel &&
    hotel.rate_per_night &&
    typeof hotel.rate_per_night === 'object'
      ? hotel.rate_per_night
      : {};


  const totalRate =
    hotel &&
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

      hotel &&
        hotel.extracted_before_taxes_fees,

      hotel &&
        hotel.extractedBeforeTaxesFees

    )
  );

}


/* =========================================================
   CURRENCY
========================================================= */

function extractCurrency(hotel) {

  const rate =
    hotel &&
    hotel.rate_per_night &&
    typeof hotel.rate_per_night === 'object'
      ? hotel.rate_per_night
      : {};


  const totalRate =
    hotel &&
    hotel.total_rate &&
    typeof hotel.total_rate === 'object'
      ? hotel.total_rate
      : {};


  return firstValue(

    hotel && hotel.currency,

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


  const images =
    asArray(
      hotel.images
    );


  const output = [];


  images.forEach(function (image) {

    if (
      typeof image === 'string'
    ) {

      if (
        image.trim()
      ) {

        output.push({

          thumbnail:
            image.trim(),

          original_image:
            image.trim(),

          url:
            image.trim()

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
            url || thumbnail

        });

      }

    }

  });


  /*
   * Some Google Hotels responses expose a separate
   * thumbnail field.
   */

  const thumbnail =
    firstValue(

      hotel.thumbnail,

      hotel.image,

      hotel.image_url,

      hotel.imageUrl

    );


  if (
    thumbnail &&
    !output.some(function (item) {

      return (
        item.url === thumbnail ||
        item.thumbnail === thumbnail
      );

    })
  ) {

    output.unshift({

      thumbnail:
        thumbnail,

      original_image:
        thumbnail,

      url:
        thumbnail

    });

  }


  return output;

}


/* =========================================================
   FREE BREAKFAST
========================================================= */

function hasFreeBreakfast(hotel, amenities) {

  if (!hotel) {

    return false;

  }


  if (
    hotel.free_breakfast === true ||
    hotel.freeBreakfast === true
  ) {

    return true;

  }


  return amenities.some(function (amenity) {

    const text =
      String(
        amenity
      )
      .toLowerCase();


    return (
      (
        text.includes('breakfast') &&
        (
          text.includes('free') ||
          text.includes('included')
        )
      )
    );

  });

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
   ADDRESS FROM PROPERTY DETAILS
========================================================= */

function extractPropertyDetailsObject(data) {

  if (!data) {

    return null;

  }


  /*
   * SerpApi property-details responses can expose the
   * property itself at the root.
   */

  if (
    data.name ||
    data.address ||
    data.hotel_class ||
    data.extracted_hotel_class
  ) {

    return data;

  }


  if (
    data.property &&
    typeof data.property === 'object'
  ) {

    return data.property;

  }


  if (
    data.data &&
    data.data.property &&
    typeof data.data.property === 'object'
  ) {

    return data.data.property;

  }


  return null;

}


/* =========================================================
   FETCH SERPAPI JSON
========================================================= */

async function fetchSerpApi(params) {

  const url =
    new URL(
      SERPAPI_URL
    );


  Object.keys(params)
    .forEach(function (key) {

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


  const response =
    await fetch(
      url.toString(),
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
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
   FETCH PROPERTY DETAILS
========================================================= */

async function fetchPropertyDetails(
  propertyToken,
  baseParams
) {

  if (!propertyToken) {

    return null;

  }


  const params = {

    engine:
      'google_hotels',

    api_key:
      process.env.SERPAPI_API_KEY,

    q:
      baseParams.q,

    check_in_date:
      baseParams.check_in_date,

    check_out_date:
      baseParams.check_out_date,

    adults:
      baseParams.adults,

    children:
      baseParams.children,

    currency:
      'USD',

    gl:
      'us',

    hl:
      'en',

    property_token:
      propertyToken

  };


  try {

    const data =
      await fetchSerpApi(
        params
      );


    return extractPropertyDetailsObject(
      data
    );

  }
  catch (error) {

    console.warn(
      'Bokkara property-details lookup failed:',
      error &&
      error.message
        ? error.message
        : error
    );


    return null;

  }

}


/* =========================================================
   CONCURRENCY HELPER
========================================================= */

async function mapWithConcurrency(
  items,
  limit,
  callback
) {

  const results =
    new Array(
      items.length
    );


  let cursor = 0;


  async function worker() {

    while (true) {

      const index =
        cursor++;


      if (
        index >= items.length
      ) {

        return;

      }


      try {

        results[index] =
          await callback(
            items[index],
            index
          );

      }
      catch (error) {

        results[index] =
          null;

      }

    }

  }


  const workers =
    Math.min(
      limit,
      Math.max(
        1,
        items.length
      )
    );


  await Promise.all(

    Array.from(
      {
        length: workers
      },
      worker
    )

  );


  return results;

}


/* =========================================================
   NORMALIZE HOTEL
========================================================= */

function normalizeHotel(
  hotel,
  index,
  detail
) {

  const detailHotel =
    detail || {};


  /*
   * Prefer search result values, but use property-details
   * values as fallback.
   */

  const name =
    firstValue(

      hotel.name,

      hotel.hotel_name,

      hotel.hotelName,

      hotel.property_name,

      hotel.propertyName,

      detailHotel.name,

      'Hotel'

    );


  const address =
    firstValue(

      extractAddress(hotel),

      extractAddress(detailHotel),

      detailHotel.address,

      detailHotel.formatted_address,

      detailHotel.formattedAddress

    );


  const stars =
    firstValue(

      extractStars(hotel),

      extractStars(detailHotel)

    );


  const rating =
    firstValue(

      extractRating(hotel),

      extractRating(detailHotel)

    );


  const reviews =
    firstValue(

      extractReviews(hotel),

      extractReviews(detailHotel)

    );


  const amenities =
    Array.from(
      new Set(

        normalizeAmenityList(
          firstValue(

            hotel.amenities,

            detailHotel.amenities

          )
        )

      )
    );


  const images =
    extractImages(
      hotel
    );


  const detailImages =
    extractImages(
      detailHotel
    );


  const allImages =
    Array.from(
      new Map(

        images
          .concat(
            detailImages
          )
          .filter(function (image) {

            return (
              image &&
              (
                image.url ||
                image.original_image ||
                image.thumbnail
              )
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


  const nightlyPrice =
    firstValue(

      extractNightlyPrice(hotel),

      extractNightlyPrice(detailHotel)

    );


  const totalPrice =
    firstValue(

      extractTotalPrice(hotel),

      extractTotalPrice(detailHotel)

    );


  const beforeTaxes =
    firstValue(

      extractBeforeTaxesPrice(hotel),

      extractBeforeTaxesPrice(detailHotel)

    );


  const freeCancellation =
    hasFreeCancellation(hotel) ||
    hasFreeCancellation(detailHotel);


  const freeBreakfast =
    hasFreeBreakfast(
      hotel,
      amenities
    ) ||
    hasFreeBreakfast(
      detailHotel,
      amenities
    );


  const gps =
    firstValue(

      hotel.gps_coordinates,

      hotel.gpsCoordinates,

      detailHotel.gps_coordinates,

      detailHotel.gpsCoordinates

    );


  const latitude =
    numberValue(
      gps &&
      (
        gps.latitude ??
        gps.lat
      )
    );


  const longitude =
    numberValue(
      gps &&
      (
        gps.longitude ??
        gps.lng
      )
    );


  const propertyToken =
    firstValue(

      hotel.property_token,

      hotel.propertyToken,

      detailHotel.property_token,

      detailHotel.propertyToken

    );


  const bookingUrl =
    firstValue(

      hotel.serpapi_property_details_link,

      hotel.serpapiPropertyDetailsLink,

      detailHotel.serpapi_property_details_link,

      detailHotel.serpapiPropertyDetailsLink,

      hotel.link,

      hotel.url,

      detailHotel.link,

      detailHotel.url

    );


  const hotelClass =
    extractStars(
      hotel
    ) ||
    extractStars(
      detailHotel
    );


  const currency =
    firstValue(

      extractCurrency(hotel),

      extractCurrency(detailHotel),

      'USD'

    );


  const source =
    firstValue(

      hotel.source,

      detailHotel.source,

      ''

    );


  return {

    /*
     * IDs
     */

    id:
      firstValue(

        hotel.property_token,

        hotel.hotel_id,

        hotel.id,

        detailHotel.property_token,

        detailHotel.hotel_id,

        'hotel-' + index

      ),

    property_token:
      propertyToken,


    hotel_id:
      firstValue(

        hotel.hotel_id,

        hotel.hotelId,

        detailHotel.hotel_id,

        detailHotel.hotelId

      ),


    place_id:
      firstValue(

        hotel.place_id,

        hotel.placeId,

        detailHotel.place_id,

        detailHotel.placeId

      ),


    /*
     * Core card information
     */

    name:
      name,

    type:
      firstValue(

        hotel.type,

        detailHotel.type,

        'hotel'

      ),


    description:
      firstValue(

        hotel.description,

        detailHotel.description,

        ''

      ),


    address:
      address || '',


    property_address:
      address || '',


    hotel_address:
      address || '',


    neighborhood:
      firstValue(

        hotel.neighborhood,

        detailHotel.neighborhood,

        ''

      ),


    city:
      firstValue(

        hotel.city,

        detailHotel.city,

        ''

      ),


    country:
      firstValue(

        hotel.country,

        detailHotel.country,

        ''

      ),


    phone:
      firstValue(

        hotel.phone,

        hotel.phone_number,

        detailHotel.phone,

        detailHotel.phone_number,

        ''

      ),


    website:
      firstValue(

        hotel.website,

        detailHotel.website,

        detailHotel.link,

        ''

      ),


    /*
     * Stars
     */

    stars:
      Number(
        hotelClass || 0
      ),


    hotel_class:
      Number(
        hotelClass || 0
      ),


    hotel_class_label:
      hotelClass
        ? (
            Number(
              hotelClass
            ) +
            '-star hotel'
          )
        : '',


    /*
     * Guest rating
     */

    overall_rating:
      Number(
        rating || 0
      ),


    rating:
      Number(
        rating || 0
      ),


    reviews:
      Number(
        reviews || 0
      ),


    review_count:
      Number(
        reviews || 0
      ),


    /*
     * Pricing
     */

    price:
      Number(
        nightlyPrice || 0
      ),


    extracted_price:
      Number(
        nightlyPrice || 0
      ),


    price_per_night:
      Number(
        nightlyPrice || 0
      ),


    total_price:
      Number(
        totalPrice || 0
      ),


    extracted_total_price:
      Number(
        totalPrice || 0
      ),


    before_taxes_fees:
      Number(
        beforeTaxes || 0
      ),


    price_display:
      nightlyPrice
        ? '$' +
          Number(
            nightlyPrice
          ).toLocaleString(
            'en-US'
          )
        : '',


    currency:
      currency,


    /*
     * Images
     */

    image:
      firstValue(

        allImages[0] &&
          allImages[0].original_image,

        allImages[0] &&
          allImages[0].url,

        allImages[0] &&
          allImages[0].thumbnail

      ),


    thumbnail:
      firstValue(

        allImages[0] &&
          allImages[0].thumbnail,

        allImages[0] &&
          allImages[0].url,

        allImages[0] &&
          allImages[0].original_image

      ),


    images:
      allImages,


    photo_count:
      allImages.length,


    photoCount:
      allImages.length,


    /*
     * Amenities
     */

    amenities:
      amenities,


    hotel_amenities:
      amenities,


    /*
     * Policies
     */

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


    /*
     * Location
     */

    latitude:
      latitude,


    longitude:
      longitude,


    gps_coordinates:
      {
        latitude:
          latitude,

        longitude:
          longitude
      },


    /*
     * Times
     */

    check_in_time:
      firstValue(

        hotel.check_in_time,

        detailHotel.check_in_time,

        ''

      ),


    check_out_time:
      firstValue(

        hotel.check_out_time,

        detailHotel.check_out_time,

        ''

      ),


    /*
     * Booking / SerpApi references
     */

    booking_url:
      bookingUrl,


    property_details_link:
      firstValue(

        hotel.serpapi_property_details_link,

        hotel.serpapiPropertyDetailsLink,

        detailHotel.serpapi_property_details_link,

        detailHotel.serpapiPropertyDetailsLink,

        ''

      ),


    serpapi_property_details_link:
      firstValue(

        hotel.serpapi_property_details_link,

        hotel.serpapiPropertyDetailsLink,

        detailHotel.serpapi_property_details_link,

        detailHotel.serpapiPropertyDetailsLink,

        ''

      ),


    source:
      source,


    sponsored:
      Boolean(
        hotel.sponsored ||
        detailHotel.sponsored
      ),


    eco_certified:
      Boolean(
        hotel.eco_certified ||
        detailHotel.eco_certified
      ),


    deal:
      firstValue(

        hotel.deal,

        detailHotel.deal,

        ''

      ),


    deal_description:
      firstValue(

        hotel.deal_description,

        detailHotel.deal_description,

        ''

      ),


    nearby_places:
      firstValue(

        hotel.nearby_places,

        detailHotel.nearby_places,

        []

      ),


    ratings:
      firstValue(

        hotel.ratings,

        detailHotel.ratings,

        []

      ),


    /*
     * Keep original objects available for future
     * hotel-detail UI work.
     */

    raw:
      hotel,

    property_details:
      detailHotel

  };

}


/* =========================================================
   EXTRACT PROPERTY ARRAY
========================================================= */

function extractProperties(data) {

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
      data.data.results,

    data.serpapi &&
      data.serpapi.properties

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
    sort === 'price-low' ||
    sort === 'price_low' ||
    sort === 'lowest-price' ||
    sort === 'lowest_price' ||
    sort === 'low'
  ) {

    return 'price-low';

  }


  if (
    sort === 'price-high' ||
    sort === 'price_high' ||
    sort === 'highest-price' ||
    sort === 'highest_price' ||
    sort === 'high'
  ) {

    return 'price-high';

  }


  if (
    sort === 'rating' ||
    sort === 'highest-rating' ||
    sort === 'rating-high'
  ) {

    return 'rating';

  }


  if (
    sort === 'stars' ||
    sort === 'star' ||
    sort === 'hotel-class'
  ) {

    return 'stars';

  }


  if (
    sort === 'reviews' ||
    sort === 'most-reviewed'
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
    normalizeSort(
      sort
    );


  const sorted =
    hotels.slice();


  sorted.sort(function (a,b) {

    if (
      normalized ===
      'price-low'
    ) {

      return (
        numberValue(a.price) -
        numberValue(b.price)
      );

    }


    if (
      normalized ===
      'price-high'
    ) {

      return (
        numberValue(b.price) -
        numberValue(a.price)
      );

    }


    if (
      normalized ===
      'rating'
    ) {

      return (
        numberValue(b.rating) -
        numberValue(a.rating)
      );

    }


    if (
      normalized ===
      'stars'
    ) {

      return (
        numberValue(b.stars) -
        numberValue(a.stars)
      );

    }


    if (
      normalized ===
      'reviews'
    ) {

      return (
        numberValue(b.reviews) -
        numberValue(a.reviews)
      );

    }


    /*
     * Recommended:
     *
     * rating first, then reviews, then price.
     */

    const scoreA =
      (
        numberValue(a.rating) * 100
      ) +
      (
        Math.min(
          numberValue(a.reviews),
          10000
        ) / 100
      );


    const scoreB =
      (
        numberValue(b.rating) * 100
      ) +
      (
        Math.min(
          numberValue(b.reviews),
          10000
        ) / 100
      );


    if (
      scoreA !== scoreB
    ) {

      return (
        scoreB -
        scoreA
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
   LOCAL FILTERS
========================================================= */

function filterHotels(
  hotels,
  options
) {

  const minPrice =
    numberValue(
      options.min_price
    );


  const maxPrice =
    numberValue(
      options.max_price
    );


  const minRating =
    numberValue(
      options.min_rating ||
      options.rating_min
    );


  const requestedStars =
    asArray(
      options.hotel_class
    )
      .map(function (value) {

        return numberValue(
          value
        );

      })
      .filter(function (value) {

        return (
          value >= 1 &&
          value <= 5
        );

      });


  const requestedAmenities =
    normalizeAmenityList(
      options.amenities
    )
      .map(function (item) {

        return String(
          item
        )
          .toLowerCase()
          .trim();

      })
      .filter(Boolean);


  const wantsFreeCancellation =
    booleanValue(
      options.free_cancellation
    );


  const wantsFreeBreakfast =
    booleanValue(
      options.free_breakfast
    );


  return hotels.filter(function (hotel) {

    const price =
      numberValue(
        hotel.price
      );


    /*
     * PRICE
     */

    if (
      minPrice > 0 &&
      (
        price <= 0 ||
        price < minPrice
      )
    ) {

      return false;

    }


    if (
      maxPrice > 0 &&
      (
        price <= 0 ||
        price > maxPrice
      )
    ) {

      return false;

    }


    /*
     * RATING
     */

    if (
      minRating > 0 &&
      numberValue(
        hotel.rating
      ) < minRating
    ) {

      return false;

    }


    /*
     * HOTEL CLASS
     *
     * If several classes are requested, match any
     * selected class.
     */

    if (
      requestedStars.length
    ) {

      const hotelStars =
        numberValue(
          hotel.stars
        );


      if (
        !requestedStars.includes(
          hotelStars
        )
      ) {

        return false;

      }

    }


    /*
     * AMENITIES
     */

    if (
      requestedAmenities.length
    ) {

      const hotelAmenities =
        normalizeAmenityList(
          hotel.amenities
        )
          .map(function (item) {

            return String(
              item
            )
              .toLowerCase();

          });


      const amenityText =
        hotelAmenities.join(
          ' | '
        );


      /*
       * Match ANY selected amenity.
       *
       * This matches the behavior of the current
       * Shopify filter script.
       */

      const matches =
        requestedAmenities.some(
          function (requested) {

            return amenityText.includes(
              requested
            );

          }
        );


      if (!matches) {

        return false;

      }

    }


    /*
     * FREE CANCELLATION
     */

    if (
      wantsFreeCancellation &&
      !hotel.free_cancellation
    ) {

      return false;

    }


    /*
     * FREE BREAKFAST
     */

    if (
      wantsFreeBreakfast &&
      !hotel.free_breakfast
    ) {

      return false;

    }


    return true;

  });

}


/* =========================================================
   BUILD SERPAPI SEARCH PARAMETERS
========================================================= */

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

    num:
      MAX_RESULTS_PER_PAGE

  };


  /*
   * Native SerpApi filters.
   */

  if (
    query.min_price
  ) {

    params.min_price =
      query.min_price;

  }


  if (
    query.max_price
  ) {

    params.max_price =
      query.max_price;

  }


  if (
    query.hotel_class
  ) {

    params.hotel_class =
      query.hotel_class;

  }


  if (
    query.rating
  ) {

    params.rating =
      query.rating;

  }


  if (
    query.amenities
  ) {

    params.amenities =
      query.amenities;

  }


  if (
    query.free_cancellation
  ) {

    params.free_cancellation =
      'true';

  }


  /*
   * SerpApi sort options:
   *
   * 3 = lowest price
   * 8 = highest rating
   * 13 = most reviewed
   */

  const sort =
    normalizeSort(
      query.sort
    );


  if (
    sort === 'price-low'
  ) {

    params.sort_by =
      '3';

  }

  else if (
    sort === 'rating'
  ) {

    params.sort_by =
      '8';

  }

  else if (
    sort === 'reviews'
  ) {

    params.sort_by =
      '13';

  }


  /*
   * Pagination.
   */

  if (
    query.next_page_token
  ) {

    params.next_page_token =
      query.next_page_token;

  }


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


  /*
   * Babies are not sent to Google Hotels as a separate
   * search parameter by the current Shopify script.
   *
   * Keep it in our response/query for compatibility.
   */

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


  let amenities =
    firstValue(
      source.amenities,
      ''
    );


  if (
    Array.isArray(
      amenities
    )
  ) {

    amenities =
      amenities.join(',');

  }


  let hotelClass =
    firstValue(
      source.hotel_class,
      ''
    );


  if (
    Array.isArray(
      hotelClass
    )
  ) {

    hotelClass =
      hotelClass.join(',');

  }


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


    min_price:
      numberValue(
        source.min_price
      ),


    max_price:
      numberValue(
        source.max_price
      ),


    hotel_class:
      String(
        hotelClass
      ).trim(),


    min_rating:
      numberValue(
        source.min_rating ||
        source.rating_min
      ),


    /*
     * SerpApi rating filter uses:
     * 7 = 3.5+
     * 8 = 4.0+
     * 9 = 4.5+
     */

    rating:
      firstValue(
        source.rating,
        ''
      ),


    amenities:
      String(
        amenities
      ).trim(),


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
      ),


    next_page_token:
      String(
        firstValue(

          source.next_page_token,

          source.nextPageToken

        )
      ).trim(),


    limit:
      Math.min(
        MAX_RESULTS_PER_PAGE,
        Math.max(
          1,
          numberValue(
            firstValue(
              source.limit,
              MAX_RESULTS_PER_PAGE
            )
          )
        )
      )

  };

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


  /*
   * OPTIONS
   */

  if (
    req.method === 'OPTIONS'
  ) {

    return res
      .status(204)
      .end();

  }


  /*
   * Methods.
   */

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


  /*
   * API key.
   */

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

    const query =
      normalizeQuery(
        req
      );


    /*
     * Required search parameters.
     */

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


    /*
     * Validate dates.
     */

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


    /*
     * Build SerpApi request.
     */

    const serpParams =
      buildSearchParams(
        query
      );


    console.log(
      'Bokkara Google Hotels request:',
      {
        ...serpParams,
        api_key:
          'REDACTED'
      }
    );


    /*
     * MAIN GOOGLE HOTELS REQUEST
     */

    const data =
      await fetchSerpApi(
        serpParams
      );


    /*
     * Extract properties.
     */

    const rawProperties =
      extractProperties(
        data
      );


    /*
     * Property details enrichment.
     *
     * We only perform the additional request when the
     * search result does not already contain an address.
     *
     * This prevents unnecessary SerpApi requests whenever
     * Google has supplied an address directly.
     */

    const propertiesNeedingDetails =
      rawProperties.filter(function (hotel) {

        return (
          !extractAddress(hotel) &&
          firstValue(
            hotel.property_token,
            hotel.propertyToken
          )
        );

      });


    const detailsMap =
      new Map();


    if (
      propertiesNeedingDetails.length
    ) {

      console.log(
        'Bokkara hotels requiring property details:',
        propertiesNeedingDetails.length
      );


      const detailResults =
        await mapWithConcurrency(

          propertiesNeedingDetails,

          DETAIL_CONCURRENCY,

          async function (hotel) {

            const token =
              firstValue(

                hotel.property_token,

                hotel.propertyToken

              );


            const detail =
              await fetchPropertyDetails(

                token,

                {
                  q:
                    query.destination,

                  check_in_date:
                    query.check_in_date,

                  check_out_date:
                    query.check_out_date,

                  adults:
                    query.adults,

                  children:
                    query.children

                }

              );


            return {

              token:
                token,

              detail:
                detail

            };

          }

        );


      detailResults.forEach(
        function (result) {

          if (
            result &&
            result.token &&
            result.detail
          ) {

            detailsMap.set(
              String(
                result.token
              ),
              result.detail
            );

          }

        }
      );

    }


    /*
     * Normalize all hotels.
     */

    let hotels =
      rawProperties.map(
        function (hotel,index) {

          const token =
            firstValue(

              hotel.property_token,

              hotel.propertyToken

            );


          const detail =
            token
              ? detailsMap.get(
                  String(
                    token
                  )
                )
              : null;


          return normalizeHotel(

            hotel,

            index,

            detail

          );

        }
      );


    /*
     * Apply filters locally as a safety layer.
     *
     * This is important because it guarantees that the
     * response still respects the filters even if Google
     * returns a property that doesn't exactly match one
     * of the requested filters.
     */

    hotels =
      filterHotels(
        hotels,
        query
      );


    /*
     * Sort locally as the final source of truth.
     *
     * This guarantees that the returned array itself is
     * correctly ordered before Shopify receives it.
     */

    hotels =
      sortHotels(
        hotels,
        query.sort
      );


    /*
     * Pagination.
     */

    const serpPagination =
      data.serpapi_pagination ||
      data.pagination ||
      {};


    const nextPageToken =
      firstValue(

        serpPagination.next_page_token,

        serpPagination.nextPageToken,

        data.next_page_token,

        data.nextPageToken

      ) || null;


    const hasMore =
      Boolean(
        nextPageToken
      );


    /*
     * Return the normalized response.
     */

    return res
      .status(200)
      .json({

        success:
          true,


        /*
         * Main array used by your Shopify script.
         */

        hotels:
          hotels,


        properties:
          hotels,


        results:
          hotels,


        /*
         * Pagination.
         */

        next_page_token:
          nextPageToken,


        nextPageToken:
          nextPageToken,


        has_more:
          hasMore,


        hasMore:
          hasMore,


        pagination:
          {
            next_page_token:
              nextPageToken,

            has_more:
              hasMore
          },


        /*
         * Search information.
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
         * Applied filters.
         */

        filters:
          {
            min_price:
              query.min_price || null,

            max_price:
              query.max_price || null,

            hotel_class:
              query.hotel_class || null,

            min_rating:
              query.min_rating || null,

            rating:
              query.rating || null,

            amenities:
              query.amenities || null,

            free_cancellation:
              query.free_cancellation,

            free_breakfast:
              query.free_breakfast
          },


        /*
         * Sorting.
         */

        sort:
          query.sort,


        /*
         * Debug metadata.
         */

        meta:
          {

            raw_property_count:
              rawProperties.length,

            returned_property_count:
              hotels.length,

            property_details_lookups:
              propertiesNeedingDetails.length,

            address_count:
              hotels.filter(
                function (hotel) {

                  return Boolean(
                    hotel.address
                  );

                }
              ).length,

            stars_count:
              hotels.filter(
                function (hotel) {

                  return (
                    numberValue(
                      hotel.stars
                    ) > 0
                  );

                }
              ).length,

            rating_count:
              hotels.filter(
                function (hotel) {

                  return (
                    numberValue(
                      hotel.rating
                    ) > 0
                  );

                }
              ).length

          },


        /*
         * Raw SerpApi pagination metadata is retained for
         * debugging without exposing the API key.
         */

        serpapi_pagination:
          data.serpapi_pagination || null

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
