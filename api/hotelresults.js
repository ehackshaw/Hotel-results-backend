/*
============================================================
BOKKARA HOTEL RESULTS API
============================================================

ENDPOINT
--------
GET /api/hotelresults

ARCHITECTURE
------------
One Bokkara search/filter action
        ↓
One Vercel request
        ↓
One SerpApi Google Hotels request
        ↓
Normalize
        ↓
Server-side verification
        ↓
Return up to 20 hotels

NO:
- Pagination
- Infinite scroll
- Load More
- Property detail requests
- Multiple SerpApi calls per search

FILTERS
-------
Supported:

price_ranges
stars
rating
amenities
free_cancellation
free_breakfast

SORTING
-------
Frontend sorting is local.

The backend does not need to make a second request
for sorting.

============================================================
*/


const SERPAPI_URL =
  'https://serpapi.com/search';


const BOKKARA_HOTEL_LIMIT =
  20;


/*
SerpApi can return more than 20 results in some cases.

We request a larger candidate set when filters are active
so the backend has a better chance of returning 20 usable
properties after quality validation.

This does NOT make another SerpApi request.
*/
const SERPAPI_NUM =
  100;


/*
Maximum number of properties we will process from the
single SerpApi response.
*/
const BOKKARA_MAX_PROPERTIES =
  100;


/* ============================================================
   CORS
   ============================================================ */

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
    'Content-Type, Accept'
  );

  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate'
  );

}


/* ============================================================
   BASIC HELPERS
   ============================================================ */

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


  const parsed =
    Number(cleaned);


  return Number.isFinite(parsed)
    ? parsed
    : 0;

}


function booleanValue(value) {

  if (
    typeof value === 'boolean'
  ) {

    return value;

  }


  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    return false;

  }


  return (
    String(value)
      .toLowerCase()
      .trim() === 'true'
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


/* ============================================================
   ARRAY PARSER
   ============================================================ */

function parseList(value) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    return [];

  }


  if (
    Array.isArray(value)
  ) {

    return value
      .map(
        function (item) {

          return String(
            item
          ).trim();

        }
      )
      .filter(Boolean);

  }


  return String(value)
    .split(',')
    .map(
      function (item) {

        return item.trim();

      }
    )
    .filter(Boolean);

}


/* ============================================================
   AMENITY NORMALIZATION
   ============================================================ */

function normalizeAmenityName(value) {

  return String(
    value || ''
  )
    .toLowerCase()
    .trim()
    .replace(
      /[_-]+/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    );

}


/*
Bokkara frontend values:

wifi
pool
parking
restaurant
gym

SerpApi's amenities parameter expects Google Hotels
amenity IDs rather than these names.

IMPORTANT:
The exact amenity IDs can change as SerpApi/Google Hotels
updates its amenity catalogue.

For values that are already numeric, we pass them through.

For friendly Bokkara names that do not have a verified
current ID in this backend, we use server-side matching
against returned amenities.

This prevents us from sending an invented SerpApi ID.
*/


const BOKKARA_AMENITY_ALIASES = {

  wifi: [
    'wifi',
    'wi-fi',
    'free wi-fi',
    'free wifi',
    'wireless internet'
  ],

  pool: [
    'pool',
    'pools',
    'outdoor pool',
    'indoor pool',
    'swimming pool',
    'swimming pools'
  ],

  parking: [
    'parking',
    'free parking',
    'self parking',
    'valet parking'
  ],

  restaurant: [
    'restaurant',
    'restaurants',
    'dining',
    'dining options'
  ],

  gym: [
    'gym',
    'fitness',
    'fitness centre',
    'fitness center',
    'fitness facility'
  ]

};


/* ============================================================
   AMENITY MATCH
   ============================================================ */

function hotelHasAmenity(
  hotel,
  requestedAmenity
) {

  const requested =
    normalizeAmenityName(
      requestedAmenity
    );


  if (!requested) {
    return true;
  }


  /*
  If the request is already a numeric SerpApi amenity ID,
  we cannot reliably match the ID against the returned
  text-only amenities, so the native SerpApi filter is
  trusted.
  */

  if (
    /^\d+$/.test(requested)
  ) {

    return true;

  }


  const aliases =
    BOKKARA_AMENITY_ALIASES[
      requested
    ] ||
    [requested];


  const hotelAmenities =
    extractAmenities(
      hotel
    );


  return hotelAmenities.some(
    function (amenity) {

      const normalized =
        normalizeAmenityName(
          amenity
        );


      return aliases.some(
        function (alias) {

          const normalizedAlias =
            normalizeAmenityName(
              alias
            );


          return (
            normalized ===
            normalizedAlias
          ) ||
          normalized.includes(
            normalizedAlias
          ) ||
          normalizedAlias.includes(
            normalized
          );

        }
      );

    }
  );

}


/* ============================================================
   AMENITIES
   ============================================================ */

function extractAmenities(hotel) {

  let amenities =
    firstValue(

      hotel.amenities,

      hotel.hotel_amenities,

      hotel.hotelAmenities

    );


  if (!amenities) {

    return [];

  }


  if (
    !Array.isArray(amenities)
  ) {

    if (
      typeof amenities === 'object'
    ) {

      amenities =
        Object.values(
          amenities
        ).flat();

    }

    else {

      amenities =
        String(
          amenities
        ).split(',');

    }

  }


  return amenities
    .map(
      function (item) {

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
            item.label

          );

        }


        return '';

      }
    )
    .filter(Boolean);

}


/* ============================================================
   ADDRESS
   ============================================================ */

function extractAddress(hotel) {

  return firstValue(

    hotel.address,

    hotel.hotel_address,

    hotel.hotelAddress,

    hotel.location &&
      hotel.location.address,

    hotel.location &&
      hotel.location.name

  );

}


/* ============================================================
   STARS
   ============================================================ */

function extractStars(hotel) {

  const numericStars =
    numberValue(
      firstValue(

        hotel.extracted_hotel_class,

        hotel.hotel_class,

        hotel.stars,

        hotel.star_rating,

        hotel.starRating,

        hotel.hotel_star_rating,

        hotel.hotelStarRating

      )
    );


  if (
    numericStars > 0
  ) {

    return numericStars;

  }


  const text =
    String(
      firstValue(
        hotel.hotel_class
      )
    );


  const match =
    text.match(
      /(\d+(?:\.\d+)?)/
    );


  return match
    ? numberValue(match[1])
    : 0;

}


/* ============================================================
   RATING
   ============================================================ */

function extractRating(hotel) {

  return numberValue(
    firstValue(

      hotel.overall_rating,

      hotel.rating,

      hotel.overallRating,

      hotel.guest_rating,

      hotel.guestRating,

      hotel.stars_rating

    )
  );

}


/* ============================================================
   REVIEWS
   ============================================================ */

function extractReviews(hotel) {

  return numberValue(
    firstValue(

      hotel.reviews,

      hotel.review_count,

      hotel.reviewCount,

      hotel.total_reviews,

      hotel.totalReviews,

      hotel.reviews_count

    )
  );

}


/* ============================================================
   PRICE
   ============================================================ */

function extractNightlyPrice(hotel) {

  const rate =
    hotel.rate_per_night;


  if (
    rate &&
    typeof rate === 'object'
  ) {

    const extracted =
      numberValue(
        firstValue(

          rate.extracted_lowest,

          rate.extracted_price,

          rate.amount,

          rate.value

        )
      );


    if (
      extracted > 0
    ) {

      return extracted;

    }

  }


  return numberValue(
    firstValue(

      hotel.extracted_price,

      hotel.price_per_night,

      hotel.pricePerNight,

      hotel.extracted_lowest,

      hotel.rate && hotel.rate.extracted_lowest,

      hotel.rate && hotel.rate.extracted_price,

      hotel.price,

      hotel.rate

    )
  );

}


/* ============================================================
   TOTAL PRICE
   ============================================================ */

function extractTotalPrice(hotel) {

  const total =
    hotel.total_rate;


  if (
    total &&
    typeof total === 'object'
  ) {

    return numberValue(
      firstValue(

        total.extracted_lowest,

        total.extracted_price,

        total.amount,

        total.value

      )
    );

  }


  return numberValue(
    firstValue(

      hotel.total_price,

      hotel.totalPrice,

      hotel.extracted_total_price

    )
  );

}


/* ============================================================
   BEFORE TAXES
   ============================================================ */

function extractBeforeTaxes(hotel) {

  const rate =
    hotel.rate_per_night;


  if (
    rate &&
    typeof rate === 'object'
  ) {

    return numberValue(
      firstValue(

        rate.extracted_before_taxes_fees,

        rate.before_taxes_fees

      )
    );

  }


  return numberValue(
    firstValue(

      hotel.extracted_before_taxes_fees,

      hotel.before_taxes_fees

    )
  );

}


/* ============================================================
   CURRENCY
   ============================================================ */

function extractCurrency(hotel) {

  return firstValue(

    hotel.currency,

    hotel.rate_per_night &&
      hotel.rate_per_night.currency,

    'USD'

  );

}


/* ============================================================
   IMAGES
   ============================================================ */

function extractImages(hotel) {

  let images = [];


  if (
    Array.isArray(
      hotel.images
    )
  ) {

    images =
      hotel.images
        .map(
          function (image) {

            if (
              typeof image === 'string'
            ) {

              return image;

            }


            if (
              image &&
              typeof image === 'object'
            ) {

              return firstValue(

                image.original_image,

                image.image,

                image.url,

                image.thumbnail

              );

            }


            return '';

          }
        )
        .filter(Boolean);

  }


  const thumbnail =
    firstValue(

      hotel.thumbnail,

      hotel.image,

      hotel.image_url,

      hotel.imageUrl,

      hotel.photo,

      hotel.thumbnail_url,

      hotel.thumbnailUrl

    );


  if (
    thumbnail &&
    !images.includes(
      thumbnail
    )
  ) {

    images.unshift(
      thumbnail
    );

  }


  return images;

}


/* ============================================================
   FREE CANCELLATION
   ============================================================ */

function hasFreeCancellation(hotel) {

  return (
    hotel.free_cancellation === true ||
    hotel.free_cancellation === 'true' ||
    hotel.freeCancellation === true ||
    hotel.freeCancellation === 'true'
  );

}


/* ============================================================
   FREE BREAKFAST
   ============================================================ */

function hasFreeBreakfast(hotel) {

  if (
    hotel.free_breakfast === true ||
    hotel.free_breakfast === 'true'
  ) {

    return true;

  }


  if (
    hotel.freeBreakfast === true ||
    hotel.freeBreakfast === 'true'
  ) {

    return true;

  }


  /*
  Check amenities for common breakfast indicators.
  */

  const amenities =
    extractAmenities(
      hotel
    )
      .map(
        function (item) {

          return normalizeAmenityName(
            item
          );

        }
      );


  return amenities.some(
    function (item) {

      return (
        item === 'free breakfast' ||
        item === 'breakfast included' ||
        item === 'complimentary breakfast'
      );

    }
  );

}


/* ============================================================
   IMAGES / QUALITY
   ============================================================ */

function isUsableHotel(hotel) {

  const price =
    extractNightlyPrice(
      hotel
    );


  const rating =
    extractRating(
      hotel
    );


  const images =
    extractImages(
      hotel
    );


  /*
  Keep the same quality rules your current backend
  already uses.

  A property must have:
  - valid price
  - image
  - rating
  */

  return (
    price > 0 &&
    rating > 0 &&
    images.length > 0
  );

}


/* ============================================================
   NORMALIZE HOTEL
   ============================================================ */

function normalizeHotel(
  hotel,
  index
) {

  const price =
    extractNightlyPrice(
      hotel
    );


  const totalPrice =
    extractTotalPrice(
      hotel
    );


  const beforeTaxes =
    extractBeforeTaxes(
      hotel
    );


  const images =
    extractImages(
      hotel
    );


  const amenities =
    extractAmenities(
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


  const id =
    firstValue(

      hotel.property_token,

      hotel.hotel_id,

      hotel.place_id,

      hotel.id,

      name +
        '|' +
        address

    );


  return {

    id: String(id),

    index: index,

    property_token:
      firstValue(
        hotel.property_token
      ),

    hotel_id:
      firstValue(
        hotel.hotel_id
      ),

    place_id:
      firstValue(
        hotel.place_id
      ),

    name: name,

    type:
      firstValue(
        hotel.type,
        'hotel'
      ),

    description:
      firstValue(
        hotel.description
      ),

    address: address,

    neighborhood:
      firstValue(
        hotel.neighborhood
      ),

    city:
      firstValue(
        hotel.city
      ),

    country:
      firstValue(
        hotel.country
      ),

    phone:
      firstValue(
        hotel.phone
      ),

    website:
      firstValue(
        hotel.website,
        hotel.link
      ),

    stars: stars,

    hotel_class:
      stars,

    rating: rating,

    reviews: reviews,

    price: price,

    extracted_price:
      price,

    price_per_night:
      price,

    total_price:
      totalPrice,

    before_taxes_fees:
      beforeTaxes,

    currency:
      extractCurrency(
        hotel
      ),

    images: images,

    image:
      images[0] || '',

    thumbnail:
      firstValue(
        hotel.thumbnail
      ),

    amenities: amenities,

    free_cancellation:
      hasFreeCancellation(
        hotel
      ),

    free_breakfast:
      hasFreeBreakfast(
        hotel
      ),

    lat:
      numberValue(
        hotel.gps_coordinates &&
          hotel.gps_coordinates.latitude
      ),

    long:
      numberValue(
        hotel.gps_coordinates &&
          hotel.gps_coordinates.longitude
      ),

    latitude:
      numberValue(
        hotel.gps_coordinates &&
          hotel.gps_coordinates.latitude
      ),

    longitude:
      numberValue(
        hotel.gps_coordinates &&
          hotel.gps_coordinates.longitude
      ),

    checkin_time:
      firstValue(
        hotel.check_in_time
      ),

    checkout_time:
      firstValue(
        hotel.check_out_time
      ),

    booking_url:
      firstValue(

        hotel.link,

        hotel.booking_url,

        hotel.bookingUrl,

        hotel.url

      ),

    serpapi_property_details_link:
      firstValue(
        hotel.serpapi_property_details_link
      ),

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
        hotel.deal
      ),

    deal_description:
      firstValue(
        hotel.deal_description
      ),

    nearby_places:
      hotel.nearby_places || [],

    ratings:
      hotel.ratings || [],

    raw: hotel

  };

}


/* ============================================================
   EXTRACT PROPERTIES
   ============================================================ */

function extractProperties(data) {

  if (
    Array.isArray(data)
  ) {

    return data;

  }


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
      data.hotels
    )
  ) {

    return data.hotels;

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
      data.data.hotels
    )
  ) {

    return data.data.hotels;

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


  return [];

}


/* ============================================================
   DEDUPE
   ============================================================ */

function dedupeHotels(hotels) {

  const seen =
    new Set();


  return hotels.filter(
    function (hotel) {

      const key =
        firstValue(

          hotel.property_token,

          hotel.hotel_id,

          hotel.place_id,

          (
            hotel.name +
            '|' +
            hotel.address
          )
            .toLowerCase()

        );


      if (
        !key ||
        seen.has(key)
      ) {

        return false;

      }


      seen.add(key);

      return true;

    }
  );

}


/* ============================================================
   PRICE RANGE PARSER
   ============================================================ */

function getPriceRange(
  range
) {

  switch (
    String(range)
      .toLowerCase()
      .trim()
  ) {

    case 'under100':

      return {
        min: 0,
        max: 99.99
      };


    case '100-200':

      return {
        min: 100,
        max: 200
      };


    case '200-300':

      return {
        min: 200.01,
        max: 300
      };


    case '300plus':

      return {
        min: 300.01,
        max: Infinity
      };


    default:

      return null;

  }

}


/* ============================================================
   COMBINE PRICE RANGES
   ============================================================ */

function getCombinedPriceRange(
  ranges
) {

  if (
    !Array.isArray(ranges) ||
    !ranges.length
  ) {

    return null;

  }


  const parsed =
    ranges
      .map(
        getPriceRange
      )
      .filter(Boolean);


  if (
    !parsed.length
  ) {

    return null;

  }


  /*
  Multiple price selections are OR.

  Example:

  100-200 + 200-300

  means:

  $100 through $300.

  We therefore calculate the broadest selected
  minimum/maximum range.

  Server-side verification below handles exact
  boundaries.
  */

  return {

    min:
      Math.min.apply(
        null,
        parsed.map(
          function (item) {
            return item.min;
          }
        )
      ),

    max:
      Math.max.apply(
        null,
        parsed.map(
          function (item) {
            return item.max;
          }
        )
      )

  };

}


/* ============================================================
   SERVER-SIDE FILTER VERIFICATION
   ============================================================

   SerpApi performs the native filtering first.

   We then verify the response so the frontend receives
   hotels that actually satisfy the Bokkara filters.

============================================================ */

function hotelMatchesFilters(
  hotel,
  filters
) {

  const price =
    numberValue(
      hotel.price
    );


  const stars =
    numberValue(
      hotel.stars
    );


  const rating =
    numberValue(
      hotel.rating
    );


  /*
  PRICE
  */

  if (
    filters.price_ranges.length
  ) {

    const priceMatches =
      filters.price_ranges.some(
        function (rangeName) {

          const range =
            getPriceRange(
              rangeName
            );


          if (!range) {
            return false;
          }


          return (
            price >= range.min &&
            price <= range.max
          );

        }
      );


    if (
      !priceMatches
    ) {

      return false;

    }

  }


  /*
  STARS

  Bokkara UI treats a selected value as a minimum.

  4 = 4 stars or higher.
  */

  if (
    filters.stars.length
  ) {

    const starMatches =
      filters.stars.some(
        function (value) {

          return (
            stars >=
            numberValue(value)
          );

        }
      );


    if (
      !starMatches
    ) {

      return false;

    }

  }


  /*
  RATING

  Bokkara UI treats the selected value as minimum
  guest rating.

  8 = 8.0+
  9 = 9.0+
  */

  if (
    filters.rating.length
  ) {

    const ratingMatches =
      filters.rating.some(
        function (value) {

          return (
            rating >=
            numberValue(value)
          );

        }
      );


    if (
      !ratingMatches
    ) {

      return false;

    }

  }


  /*
  AMENITIES

  Multiple amenities are AND.

  Example:

  Pool + Gym

  Hotel must have BOTH.
  */

  if (
    filters.amenities.length
  ) {

    const allAmenitiesMatch =
      filters.amenities.every(
        function (amenity) {

          return hotelHasAmenity(
            hotel.raw,
            amenity
          );

        }
      );


    if (
      !allAmenitiesMatch
    ) {

      return false;

    }

  }


  /*
  FREE CANCELLATION
  */

  if (
    filters.free_cancellation
  ) {

    if (
      !hotel.free_cancellation
    ) {

      return false;

    }

  }


  /*
  FREE BREAKFAST
  */

  if (
    filters.free_breakfast
  ) {

    if (
      !hotel.free_breakfast
    ) {

      return false;

    }

  }


  return true;

}


/* ============================================================
   SORT
   ============================================================ */

function sortHotels(
  hotels,
  sort
) {

  const results =
    hotels.slice();


  results.sort(
    function (a, b) {

      if (
        sort === 'price-low'
      ) {

        return (
          a.price -
          b.price
        );

      }


      if (
        sort === 'price-high'
      ) {

        return (
          b.price -
          a.price
        );

      }


      if (
        sort === 'rating'
      ) {

        return (
          b.rating -
          a.rating
        );

      }


      if (
        sort === 'stars'
      ) {

        return (
          b.stars -
          a.stars
        );

      }


      if (
        sort === 'reviews'
      ) {

        return (
          b.reviews -
          a.reviews
        );

      }


      /*
      Recommended
      */

      return (
        b.rating -
        a.rating ||

        b.reviews -
        a.reviews ||

        a.price -
        b.price
      );

    }
  );


  return results;

}


/* ============================================================
   NORMALIZE QUERY
   ============================================================ */

function normalizeQuery(req) {

  const source =
    req.method === 'POST'
      ? (
          req.body &&
          typeof req.body === 'object'
            ? req.body
            : {}
        )
      : req.query || {};


  /*
  Basic search
  */

  const destination =
    stringValue(
      firstValue(

        source.destination,

        source.q,

        source.location

      )
    );


  const checkIn =
    stringValue(
      firstValue(

        source.checkin,

        source.check_in_date,

        source.checkIn

      )
    );


  const checkOut =
    stringValue(
      firstValue(

        source.checkout,

        source.check_out_date,

        source.checkOut

      )
    );


  /*
  Guest data
  */

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
        source.adults
      )
    );


  const children =
    Math.max(
      0,
      numberValue(
        source.children
      )
    );


  const babies =
    Math.max(
      0,
      numberValue(
        firstValue(
          source.babies,
          source.infants
        )
      )
    );


  const seniors =
    Math.max(
      0,
      numberValue(
        source.seniors
      )
    );


  const guests =
    Math.max(
      0,
      numberValue(
        source.guests
      )
    );


  /*
  Limit

  Frontend requests 20.
  Backend caps it at 20.
  */

  const requestedLimit =
    numberValue(
      firstValue(
        source.limit,
        BOKKARA_HOTEL_LIMIT
      )
    );


  const limit =
    Math.min(
      BOKKARA_HOTEL_LIMIT,
      Math.max(
        1,
        requestedLimit ||
        BOKKARA_HOTEL_LIMIT
      )
    );


  /*
  FILTERS
  */

  const priceRanges =
    parseList(
      firstValue(
        source.price_ranges,
        source.priceRange,
        source.price
      )
    );


  const stars =
    parseList(
      firstValue(
        source.stars,
        source.hotel_class,
        source.hotelClass
      )
    );


  const rating =
    parseList(
      firstValue(
        source.rating,
        source.min_rating,
        source.minRating
      )
    );


  const amenities =
    parseList(
      firstValue(
        source.amenities,
        source.amenity
      )
    );


  const freeCancellation =
    booleanValue(
      firstValue(
        source.free_cancellation,
        source.freeCancellation
      )
    );


  const freeBreakfast =
    booleanValue(
      firstValue(
        source.free_breakfast,
        source.freeBreakfast
      )
    );


  const sort =
    stringValue(
      firstValue(
        source.sort,
        'recommended'
      )
    );


  return {

    destination,

    check_in_date:
      checkIn,

    check_out_date:
      checkOut,

    rooms,

    adults,

    children,

    babies,

    seniors,

    guests,

    limit,

    filters: {

      price_ranges:
        priceRanges,

      stars,

      rating,

      amenities,

      free_cancellation:
        freeCancellation,

      free_breakfast:
        freeBreakfast

    },

    sort

  };

}


/* ============================================================
   SERPAPI AMENITY FILTER CONVERSION
   ============================================================ */

function getSerpApiAmenityIds(
  amenities
) {

  /*
  The frontend sends Bokkara-friendly names.

  If a numeric value is supplied, pass it through
  directly because that is already a SerpApi amenity ID.

  For named amenities we intentionally do NOT invent
  numeric IDs. SerpApi requires its own amenity IDs.
  */

  return amenities
    .filter(
      function (amenity) {

        return /^\d+$/.test(
          String(
            amenity
          ).trim()
        );

      }
    )
    .map(
      function (amenity) {

        return String(
          amenity
        ).trim();

      }
    );

}


/* ============================================================
   BUILD SERPAPI SEARCH PARAMS
   ============================================================ */

function buildSearchParams(
  query
) {

  const params =
    new URLSearchParams();


  /*
  CORE
  */

  params.set(
    'engine',
    'google_hotels'
  );


  params.set(
    'api_key',
    process.env.SERPAPI_API_KEY
  );


  params.set(
    'q',
    query.destination
  );


  params.set(
    'check_in_date',
    query.check_in_date
  );


  params.set(
    'check_out_date',
    query.check_out_date
  );


  /*
  Guests
  */

  params.set(
    'adults',
    String(
      Math.max(
        1,
        query.adults || 1
      )
    )
  );


  params.set(
    'children',
    String(
      query.children || 0
    )
  );


  /*
  Rooms.

  Google Hotels / SerpApi does not expose a universal
  rooms filter in the same way as our Bokkara UI, so
  rooms remain part of Bokkara's search context.
  */

  /*
  LOCALIZATION
  */

  params.set(
    'currency',
    'USD'
  );


  params.set(
    'hl',
    'en'
  );


  params.set(
    'gl',
    'us'
  );


  /*
  Ask SerpApi for a larger candidate set in the SAME
  request so server-side quality validation has enough
  properties to work with.

  SerpApi's Google Hotels API exposes 20-result pages
  and a next_page_token for additional pages. We are
  deliberately NOT using pagination here.
  */

  params.set(
    'num',
    String(
      SERPAPI_NUM
    )
  );


  params.set(
    'deep_search',
    'true'
  );


  params.set(
    'show_hidden',
    'true'
  );


  /* ==========================================================
     PRICE FILTER
     ========================================================== */

  const priceRange =
    getCombinedPriceRange(
      query.filters.price_ranges
    );


  if (
    priceRange
  ) {

    if (
      priceRange.min > 0
    ) {

      params.set(
        'min_price',
        String(
          Math.ceil(
            priceRange.min
          )
        )
      );

    }


    if (
      Number.isFinite(
        priceRange.max
      )
    ) {

      params.set(
        'max_price',
        String(
          Math.floor(
            priceRange.max
          )
        )
      );

    }

  }


  /* ==========================================================
     RATING FILTER
     ==========================================================

     SerpApi supports:
     7 = 3.5+
     8 = 4.0+
     9 = 4.5+
  ========================================================== */

  if (
    query.filters.rating.length
  ) {

    const ratingValues =
      query.filters.rating
        .map(
          function (value) {

            const numeric =
              numberValue(
                value
              );


            if (
              numeric >= 9
            ) {

              return '9';

            }


            if (
              numeric >= 8
            ) {

              return '8';

            }


            if (
              numeric >= 7
            ) {

              return '7';

            }


            return '';

          }
        )
        .filter(Boolean);


    /*
    SerpApi accepts a single rating threshold.

    We choose the strongest selected threshold.

    Example:

    8 + 9
    → 9

    because 9 is the stricter requirement.
    */

    if (
      ratingValues.length
    ) {

      params.set(
        'rating',
        String(
          Math.max.apply(
            null,
            ratingValues.map(
              Number
            )
          )
        )
      );

    }

  }


  /* ==========================================================
     HOTEL CLASS
     ========================================================== */

  if (
    query.filters.stars.length
  ) {

    /*
    Bokkara treats stars as minimum.

    Example:
    4 → 4 and 5 star hotels.

    SerpApi's hotel_class parameter supports explicit
    hotel classes. We therefore send all acceptable
    classes.

    4 → 4,5
    5 → 5
    */

    const minimumStars =
      Math.max.apply(
        null,
        query.filters.stars.map(
          numberValue
        )
      );


    if (
      minimumStars >= 2 &&
      minimumStars <= 5
    ) {

      const acceptableClasses =
        [];


      for (
        let star = minimumStars;
        star <= 5;
        star++
      ) {

        acceptableClasses.push(
          String(star)
        );

      }


      params.set(
        'hotel_class',
        acceptableClasses.join(',')
      );

    }

  }


  /* ==========================================================
     AMENITIES
     ========================================================== */

  const amenityIds =
    getSerpApiAmenityIds(
      query.filters.amenities
    );


  if (
    amenityIds.length
  ) {

    params.set(
      'amenities',
      amenityIds.join(',')
    );

  }


  /*
  Named amenities such as "pool" are verified
  server-side after SerpApi returns its properties.
  */


  /* ==========================================================
     FREE CANCELLATION
     ========================================================== */

  if (
    query.filters.free_cancellation
  ) {

    params.set(
      'free_cancellation',
      'true'
    );

  }


  /*
  We deliberately do NOT send:

  sort_by

  because sorting is a frontend-only operation.
  */


  return params;

}


/* ============================================================
   FETCH SERPAPI
   ============================================================ */

async function fetchSerpApi(
  params
) {

  const response =
    await fetch(
      SERPAPI_URL +
      '?' +
      params.toString(),
      {
        method: 'GET',

        headers: {
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
      'SerpApi returned an invalid JSON response.'
    );

  }


  if (
    !response.ok
  ) {

    throw new Error(
      firstValue(

        data.error,

        data.message,

        'SerpApi hotel search failed.'

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


/* ============================================================
   MAIN HANDLER
   ============================================================ */

export default async function handler(
  req,
  res
) {

  setCors(
    res
  );


  /*
  OPTIONS
  */

  if (
    req.method === 'OPTIONS'
  ) {

    res.status(
      204
    ).end();

    return;

  }


  /*
  METHOD
  */

  if (
    req.method !== 'GET' &&
    req.method !== 'POST'
  ) {

    res.status(
      405
    ).json({

      success: false,

      error:
        'Method not allowed.'

    });

    return;

  }


  /*
  API KEY
  */

  if (
    !process.env.SERPAPI_API_KEY
  ) {

    res.status(
      500
    ).json({

      success: false,

      error:
        'SERPAPI_API_KEY is not configured.'

    });

    return;

  }


  try {

    /*
    Normalize request.
    */

    const query =
      normalizeQuery(
        req
      );


    /*
    Validate destination.
    */

    if (
      !query.destination
    ) {

      res.status(
        400
      ).json({

        success: false,

        error:
          'Destination is required.'

      });

      return;

    }


    /*
    Validate dates.
    */

    if (
      !query.check_in_date ||
      !query.check_out_date
    ) {

      res.status(
        400
      ).json({

        success: false,

        error:
          'Check-in and check-out dates are required.'

      });

      return;

    }


    /*
    Validate date order.
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

      res.status(
        400
      ).json({

        success: false,

        error:
          'Invalid check-in or check-out date.'

      });

      return;

    }


    if (
      checkOut <= checkIn
    ) {

      res.status(
        400
      ).json({

        success: false,

        error:
          'Check-out date must be after check-in date.'

      });

      return;

    }


    /* ==========================================================
       BUILD SERPAPI REQUEST
       ========================================================== */

    const serpParams =
      buildSearchParams(
        query
      );


    /*
    Log the request WITHOUT exposing the API key.
    */

    const debugParams =
      new URLSearchParams(
        serpParams.toString()
      );


    debugParams.delete(
      'api_key'
    );


    console.log(
      'Bokkara → SerpApi request:',
      debugParams.toString()
    );


    /* ==========================================================
       ONE SERPAPI REQUEST
       ========================================================== */

    const data =
      await fetchSerpApi(
        serpParams
      );


    /* ==========================================================
       EXTRACT
       ========================================================== */

    const rawProperties =
      extractProperties(
        data
      )
        .slice(
          0,
          BOKKARA_MAX_PROPERTIES
        );


    console.log(
      'Bokkara raw properties:',
      rawProperties.length
    );


    /* ==========================================================
       NORMALIZE
       ========================================================== */

    const normalized =
      rawProperties
        .map(
          function (hotel, index) {

            return normalizeHotel(
              hotel,
              index
            );

          }
        );


    /* ==========================================================
       QUALITY FILTER
       ========================================================== */

    const usable =
      normalized.filter(
        function (hotel) {

          return isUsableHotel(
            hotel.raw
          );

        }
      );


    /* ==========================================================
       DEDUPE
       ========================================================== */

    const unique =
      dedupeHotels(
        usable
      );


    /* ==========================================================
       BOKKARA FILTER VERIFICATION
       ========================================================== */

    const filtered =
      unique.filter(
        function (hotel) {

          return hotelMatchesFilters(
            hotel,
            query.filters
          );

        }
      );


    console.log(
      'Bokkara usable:',
      usable.length
    );


    console.log(
      'Bokkara after filters:',
      filtered.length
    );


    /* ==========================================================
       SORT
       ==========================================================

       Recommended is the default backend ordering.

       The frontend can still re-sort these same results
       without another API request.
    */

    const sorted =
      sortHotels(
        filtered,
        query.sort
      );


    /*
    Return only the requested 20.

    IMPORTANT:

    We do not make another SerpApi request if fewer than
    20 remain after filtering.

    That preserves the one-search / one-SerpApi-request
    architecture.
    */

    const hotels =
      sorted.slice(
        0,
        query.limit
      );


    /* ==========================================================
       RESPONSE
       ========================================================== */

    res.status(
      200
    ).json({

      success: true,

      hotels: hotels,

      properties: hotels,

      results: hotels,


      search: {

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


      filters: {

        price_ranges:
          query.filters.price_ranges,

        stars:
          query.filters.stars,

        rating:
          query.filters.rating,

        amenities:
          query.filters.amenities,

        free_cancellation:
          query.filters.free_cancellation,

        free_breakfast:
          query.filters.free_breakfast

      },


      sort:
        query.sort,


      pagination: {

        next_page_token:
          null,

        has_more:
          false

      },


      cache: {

        enabled:
          false,

        strategy:
          'single-serpapi-request-per-search-or-filter'

      },


      meta: {

        requested_limit:
          query.limit,

        raw_properties:
          rawProperties.length,

        usable_properties:
          usable.length,

        unique_properties:
          unique.length,

        filtered_properties:
          filtered.length,

        returned_properties:
          hotels.length,

        serpapi_request_count:
          1

      }

    });

  }


  catch (error) {

    console.error(
      'Bokkara hotel API error:',
      error
    );


    res.status(
      500
    ).json({

      success: false,

      error:
        error &&
        error.message
          ? error.message
          : 'Hotel search failed.'

    });

  }

}
