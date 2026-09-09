/**
 * =========================================================
 * BOKKARA HOTELS API
 * =========================================================
 *
 * Backend proxy for SerpApi Google Hotels.
 *
 * PAGINATION:
 *
 * offset=0
 *   -> return qualifying properties 1-50
 *
 * offset=50
 *   -> skip qualifying properties 1-50
 *   -> return qualifying properties 51-100
 *
 * offset=100
 *   -> skip qualifying properties 1-100
 *   -> return qualifying properties 101-150
 *
 * IMPORTANT:
 *
 * SerpApi does NOT use numeric offsets.
 *
 * SerpApi uses next_page_token.
 *
 * This backend converts the numeric Bokkara offset into
 * SerpApi pagination automatically.
 *
 * =========================================================
 *
 * Endpoint:
 *
 * GET /api/hotels
 *
 * Example:
 *
 * /api/hotels
 *   ?destination=Port%20of%20Spain
 *   &check_in_date=2026-09-15
 *   &check_out_date=2026-09-18
 *   &adults=2
 *   &rooms=1
 *   &offset=50
 *
 * Environment variable required:
 *
 * SERPAPI_KEY=YOUR_SERPAPI_KEY
 *
 * =========================================================
 */

export default async function handler(req, res) {

  /*
   * -------------------------------------------------------
   * CORS
   * -------------------------------------------------------
   */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );


  if (req.method === "OPTIONS") {

    return res.status(200).end();

  }


  if (req.method !== "GET") {

    return res.status(405).json({

      success: false,

      error: "Method not allowed"

    });

  }


  /*
   * -------------------------------------------------------
   * API KEY
   * -------------------------------------------------------
   */

  const API_KEY =
    process.env.SERPAPI_KEY;


  if (!API_KEY) {

    return res.status(500).json({

      success: false,

      error:
        "SERPAPI_KEY environment variable is missing."

    });

  }


  /*
   * -------------------------------------------------------
   * REQUEST PARAMETERS
   * -------------------------------------------------------
   */

  const {

    destination,

    q,

    check_in_date,

    check_out_date,

    adults = "2",

    children = "0",

    rooms = "1",

    gl = "tt",

    hl = "en",

    currency = "USD",

    sort,

    min_price,

    max_price,

    rating,

    stars,

    amenities,

    free_cancellation,

    special_offers,

    property_types,

    next_page_token

  } = req.query;


  /*
   * -------------------------------------------------------
   * DESTINATION
   * -------------------------------------------------------
   */

  const searchQuery =
    destination ||
    q ||
    "Port of Spain";


  /*
   * -------------------------------------------------------
   * VALIDATION
   * -------------------------------------------------------
   */

  if (!searchQuery) {

    return res.status(400).json({

      success: false,

      error:
        "A destination is required."

    });

  }


  /*
   * =======================================================
   * NUMERIC PAGINATION
   * =======================================================
   *
   * Bokkara uses:
   *
   * offset=0
   * offset=50
   * offset=100
   *
   * SerpApi uses:
   *
   * page 1
   * next_page_token
   * next_page_token
   *
   * We translate between the two.
   */

  const requestedOffset =
    Math.max(
      0,
      parseInt(
        req.query.offset || "0",
        10
      ) || 0
    );


  /*
   * Fixed number of hotels returned per
   * Bokkara page.
   */

  const requestedLimit =
    50;


  /*
   * -------------------------------------------------------
   * SERPAPI PAGE SAFETY
   * -------------------------------------------------------
   *
   * A single SerpApi request normally returns around
   * 20 properties.
   *
   * For large offsets we may need several requests.
   *
   * Example:
   *
   * offset=50
   *
   * could require:
   *
   * SerpApi page 1
   * SerpApi page 2
   * SerpApi page 3
   *
   * before the next 50 properties are collected.
   */

  const MAX_SERPAPI_PAGES =
    25;


  /*
   * -------------------------------------------------------
   * SERPAPI PARAMETERS
   * -------------------------------------------------------
   */

  const params =
    new URLSearchParams();


  params.set(
    "engine",
    "google_hotels"
  );


  params.set(
    "q",
    searchQuery
  );


  params.set(
    "api_key",
    API_KEY
  );


  /*
   * -------------------------------------------------------
   * DATES
   * -------------------------------------------------------
   */

  if (check_in_date) {

    params.set(
      "check_in_date",
      check_in_date
    );

  }


  if (check_out_date) {

    params.set(
      "check_out_date",
      check_out_date
    );

  }


  /*
   * -------------------------------------------------------
   * GUESTS
   * -------------------------------------------------------
   */

  params.set(
    "adults",
    String(adults)
  );


  params.set(
    "children",
    String(children)
  );


  params.set(
    "rooms",
    String(rooms)
  );


  /*
   * -------------------------------------------------------
   * LOCALIZATION
   * -------------------------------------------------------
   */

  params.set(
    "gl",
    gl
  );


  params.set(
    "hl",
    hl
  );


  params.set(
    "currency",
    currency
  );


  /*
   * -------------------------------------------------------
   * SORTING
   * -------------------------------------------------------
   */

  if (sort === "price-low") {

    params.set(
      "sort_by",
      "3"
    );

  }

  else if (sort === "rating") {

    params.set(
      "sort_by",
      "8"
    );

  }

  else if (sort === "price-high") {

    /*
     * Sorted locally below.
     */

  }

  else if (sort === "stars") {

    /*
     * Sorted locally below.
     */

  }

  else if (sort === "recommended") {

    /*
     * Keep SerpApi default ordering.
     */

  }


  /*
   * -------------------------------------------------------
   * PRICE FILTERS
   * -------------------------------------------------------
   */

  if (min_price) {

    params.set(
      "min_price",
      String(min_price)
    );

  }


  if (max_price) {

    params.set(
      "max_price",
      String(max_price)
    );

  }


  /*
   * -------------------------------------------------------
   * RATING FILTER
   * -------------------------------------------------------
   */

  if (
    rating === "7" ||
    rating === "8" ||
    rating === "9"
  ) {

    params.set(
      "rating",
      rating
    );

  }


  /*
   * -------------------------------------------------------
   * STAR FILTER
   * -------------------------------------------------------
   */

  if (stars) {

    const validStars =
      String(stars)
        .split(",")
        .filter(function (value) {

          return [
            "2",
            "3",
            "4",
            "5"
          ].includes(value);

        });


    if (validStars.length) {

      params.set(
        "hotel_class",
        validStars.join(",")
      );

    }

  }


  /*
   * -------------------------------------------------------
   * AMENITIES
   * -------------------------------------------------------
   */

  const amenityMap = {

    wifi: "35",

    pool: "9",

    parking: "19",

    restaurant: "14",

    gym: "7"

  };


  if (amenities) {

    const requestedAmenities =
      String(amenities)
        .split(",")
        .map(function (item) {

          return item
            .trim()
            .toLowerCase();

        })
        .filter(Boolean);


    const serpAmenities =
      requestedAmenities
        .map(function (item) {

          return amenityMap[item];

        })
        .filter(Boolean);


    if (serpAmenities.length) {

      params.set(
        "amenities",
        serpAmenities.join(",")
      );

    }

  }


  /*
   * -------------------------------------------------------
   * FREE CANCELLATION
   * -------------------------------------------------------
   */

  if (
    free_cancellation === "true"
  ) {

    params.set(
      "free_cancellation",
      "true"
    );

  }


  /*
   * -------------------------------------------------------
   * SPECIAL OFFERS
   * -------------------------------------------------------
   */

  if (
    special_offers === "true"
  ) {

    params.set(
      "special_offers",
      "true"
    );

  }


  /*
   * -------------------------------------------------------
   * PROPERTY TYPES
   * -------------------------------------------------------
   */

  if (property_types) {

    params.set(
      "property_types",
      String(property_types)
    );

  }


  /*
   * =======================================================
   * PAGINATION STATE
   * =======================================================
   */

  let currentPageToken =
    next_page_token ||
    null;


  let pagesFetched =
    0;


  /*
   * Number of qualifying properties skipped
   * because of the requested offset.
   */

  let qualifyingPropertiesSkipped =
    0;


  /*
   * Properties that will eventually be returned.
   */

  let allUsableProperties =
    [];


  /*
   * Prevent duplicates between SerpApi pages.
   */

  const seenProperties =
    new Set();


  /*
   * The token returned by the LAST SerpApi page
   * that we successfully processed.
   */

  let lastNextPageToken =
    null;


  /*
   * True when SerpApi has no more pages.
   */

  let reachedEnd =
    false;


  /*
   * =======================================================
   * SERPAPI PAGINATION LOOP
   * =======================================================
   */

  while (
    allUsableProperties.length <
      requestedLimit &&
    pagesFetched <
      MAX_SERPAPI_PAGES
  ) {

    /*
     * -----------------------------------------------------
     * CREATE REQUEST PARAMETERS FOR THIS PAGE
     * -----------------------------------------------------
     */

    const pageParams =
      new URLSearchParams(
        params.toString()
      );


    /*
     * -----------------------------------------------------
     * SERPAPI NEXT PAGE TOKEN
     * -----------------------------------------------------
     */

    if (currentPageToken) {

      pageParams.set(
        "next_page_token",
        String(
          currentPageToken
        )
      );

    }

    else {

      pageParams.delete(
        "next_page_token"
      );

    }


    /*
     * -----------------------------------------------------
     * SERPAPI REQUEST
     * -----------------------------------------------------
     */

    const serpApiUrl =
      "https://serpapi.com/search?" +
      pageParams.toString();


    const response =
      await fetch(
        serpApiUrl,
        {
          method: "GET",

          headers: {

            "Accept":
              "application/json"

          }

        }
      );


    let data;


    try {

      data =
        await response.json();

    }

    catch (jsonError) {

      return res.status(502).json({

        success: false,

        error:
          "SerpApi returned an invalid response."

      });

    }


    pagesFetched++;


    /*
     * -----------------------------------------------------
     * SERPAPI HTTP ERROR
     * -----------------------------------------------------
     */

    if (!response.ok) {

      return res.status(
        response.status
      ).json({

        success: false,

        error:
          data.error ||
          "SerpApi request failed.",

        serpapi:
          data

      });

    }


    /*
     * -----------------------------------------------------
     * SERPAPI API ERROR
     * -----------------------------------------------------
     */

    if (data.error) {

      return res.status(400).json({

        success: false,

        error:
          data.error

      });

    }


    /*
     * -----------------------------------------------------
     * GET PROPERTIES
     * -----------------------------------------------------
     */

    const pageProperties =
      Array.isArray(
        data.properties
      )
        ? data.properties
        : [];


    /*
     * =====================================================
     * GET NEXT PAGE TOKEN IMMEDIATELY
     * =====================================================
     *
     * IMPORTANT:
     *
     * We capture this BEFORE checking whether we've
     * collected 50 properties.
     *
     * This fixes the old behavior where the backend
     * could stop at 50 and accidentally lose the token
     * needed for the next page.
     */

    const pageNextToken =
      data.next_page_token ||
      null;


    /*
     * =====================================================
     * PROCESS SERPAPI PAGE
     * =====================================================
     */

    for (
      const hotel of pageProperties
    ) {

      /*
       * ---------------------------------------------------
       * DUPLICATE PROPERTY KEY
       * ---------------------------------------------------
       */

      const propertyKey =
        hotel.property_token ||
        (
          String(
            hotel.name ||
            ""
          )
            .trim()
            .toLowerCase() +
          "|" +
          String(
            hotel.address ||
            hotel.location ||
            ""
          )
            .trim()
            .toLowerCase()
        );


      /*
       * Skip duplicates.
       */

      if (
        seenProperties.has(
          propertyKey
        )
      ) {

        continue;

      }


      /*
       * ===================================================
       * QUALITY FILTER
       * ===================================================
       *
       * The hotel must have:
       *
       * 1. Valid price
       * 2. Valid image
       * 3. Valid star rating
       *
       * Only qualifying properties count toward offset.
       */

      const rate =
        hotel.rate_per_night ||
        {};


      const nightlyPrice =
        Number(
          rate.extracted_lowest ||
          rate.extracted_before_taxes_fees ||
          0
        );


      const hasPrice =
        nightlyPrice > 0;


      /*
       * ---------------------------------------------------
       * IMAGE
       * ---------------------------------------------------
       */

      const hasImages =
        Array.isArray(
          hotel.images
        ) &&
        hotel.images.some(
          function (image) {

            return Boolean(
              image &&
              (
                image.original_image ||
                image.thumbnail
              )
            );

          }
        );


      const hasPrimaryImage =
        Boolean(
          hotel.thumbnail ||
          hotel.image
        );


      const hasImage =
        hasImages ||
        hasPrimaryImage;


      /*
       * ---------------------------------------------------
       * STARS
       * ---------------------------------------------------
       */

      let hotelStars =
        Number(
          hotel.extracted_hotel_class ||
          0
        );


      if (
        !hotelStars &&
        hotel.hotel_class
      ) {

        const starMatch =
          String(
            hotel.hotel_class
          ).match(
            /(\d+)/
          );


        if (starMatch) {

          hotelStars =
            Number(
              starMatch[1]
            );

          }

      }


      const hasStars =
        hotelStars > 0;


      /*
       * ---------------------------------------------------
       * FINAL QUALITY CHECK
       * ---------------------------------------------------
       */

      if (
        !hasPrice ||
        !hasImage ||
        !hasStars
      ) {

        /*
         * IMPORTANT:
         *
         * Non-qualifying properties DO NOT count
         * toward the numeric offset.
         */

        continue;

      }


      /*
       * This property is now considered a unique
       * qualifying property.
       */

      seenProperties.add(
        propertyKey
      );


      /*
       * ===================================================
       * OFFSET HANDLING
       * ===================================================
       *
       * Example:
       *
       * offset=50
       *
       * First 50 qualifying properties:
       *
       *   skipped
       *
       * Property #51 onward:
       *
       *   returned
       * ===================================================
       */

      if (
        qualifyingPropertiesSkipped <
        requestedOffset
      ) {

        qualifyingPropertiesSkipped++;

        continue;

      }


      /*
       * ===================================================
       * ADD TO CURRENT RESPONSE PAGE
       * ===================================================
       */

      allUsableProperties.push(
        hotel
      );


      /*
       * We have our 50-property page.
       */

      if (
        allUsableProperties.length >=
        requestedLimit
      ) {

        break;

      }

    }


    /*
     * =====================================================
     * HAVE 50 RESULTS?
     * =====================================================
     */

    if (
      allUsableProperties.length >=
      requestedLimit
    ) {

      /*
       * IMPORTANT:
       *
       * Save the token from THIS SerpApi page.
       *
       * The next request can use it to continue after
       * the page containing the final returned hotel.
       */

      lastNextPageToken =
        pageNextToken;

      break;

    }


    /*
     * =====================================================
     * NO MORE SERPAPI PAGES
     * =====================================================
     */

    if (!pageNextToken) {

      reachedEnd =
        true;

      lastNextPageToken =
        null;

      break;

    }


    /*
     * =====================================================
     * CONTINUE TO NEXT SERPAPI PAGE
     * =====================================================
     */

    currentPageToken =
      pageNextToken;


    lastNextPageToken =
      pageNextToken;

  }


  /*
   * =======================================================
   * NORMALIZE PROPERTIES
   * =======================================================
   */

  const properties =
    allUsableProperties.slice(
      0,
      requestedLimit
    );


  let hotels =
    properties.map(
      function (hotel, index) {

        return normalizeHotel(
          hotel,
          index,
          searchQuery
        );

      }
    );


  /*
   * =======================================================
   * LOCAL AMENITY FILTER
   * =======================================================
   *
   * Kept exactly as before.
   *
   * NOTE:
   *
   * These local filters happen AFTER pagination.
   *
   * This preserves the existing behavior of your API.
   * =======================================================
   */

  if (amenities) {

    const requested =
      String(amenities)
        .split(",")
        .map(function (item) {

          return item
            .trim()
            .toLowerCase();

        })
        .filter(Boolean);


    if (requested.length) {

      hotels =
        hotels.filter(
          function (hotel) {

            return requested.every(
              function (required) {

                return hotel.amenity_keys
                  .includes(required);

              }
            );

          }
        );

    }

  }


  /*
   * =======================================================
   * FREE CANCELLATION LOCAL FILTER
   * =======================================================
   */

  if (
    free_cancellation === "true"
  ) {

    hotels =
      hotels.filter(
        function (hotel) {

          return (
            hotel.free_cancellation ===
            true
          );

        }
      );

  }


  /*
   * =======================================================
   * PRICE RANGE FILTER
   * =======================================================
   */

  if (req.query.price_range) {

    const ranges =
      String(
        req.query.price_range
      )
        .split(",")
        .map(function (item) {

          return item.trim();

        })
        .filter(Boolean);


    hotels =
      hotels.filter(
        function (hotel) {

          const price =
            Number(
              hotel.price_per_night
            );


          return ranges.some(
            function (range) {

              if (
                range === "under100"
              ) {

                return price < 100;

              }


              if (
                range === "100-200"
              ) {

                return (
                  price >= 100 &&
                  price <= 200
                );

              }


              if (
                range === "200-300"
              ) {

                return (
                  price >= 200 &&
                  price <= 300
                );

              }


              if (
                range === "300plus"
              ) {

                return price >= 300;

              }


              return true;

            }
          );

        }
      );

  }


  /*
   * =======================================================
   * LOCAL SORTING
   * =======================================================
   */

  if (
    sort === "price-high"
  ) {

    hotels.sort(
      function (a, b) {

        return (
          b.price_per_night -
          a.price_per_night
        );

      }
    );

  }


  if (
    sort === "stars"
  ) {

    hotels.sort(
      function (a, b) {

        if (
          b.stars !== a.stars
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

  }


  if (
    sort === "rating"
  ) {

    hotels.sort(
      function (a, b) {

        return (
          b.rating -
          a.rating
        );

      }

    );

  }


  if (
    sort === "price-low"
  ) {

    hotels.sort(
      function (a, b) {

        return (
          a.price_per_night -
          b.price_per_night
        );

      }

    );

  }


  /*
   * =======================================================
   * FINAL LIMIT
   * =======================================================
   */

  hotels =
    hotels.slice(
      0,
      requestedLimit
    );


  /*
   * =======================================================
   * HAS MORE
   * =======================================================
   *
   * If we successfully reached the requested 50 and
   * SerpApi gave us another token, there may be more.
   *
   * If SerpApi has no token, we've reached the end.
   *
   * IMPORTANT:
   *
   * next_offset is based on the number of qualifying
   * properties actually returned.
   * =======================================================
   */

  const hasMore =
    Boolean(
      lastNextPageToken
    ) &&
    !reachedEnd;


  const nextOffset =
    hasMore
      ? requestedOffset +
        hotels.length
      : null;


  /*
   * =======================================================
   * RESPONSE
   * =======================================================
   */

  return res.status(200).json({

    success: true,

    destination:
      searchQuery,


    /*
     * -----------------------------------------------------
     * SEARCH
     * -----------------------------------------------------
     */

    search: {

      check_in_date:
        check_in_date ||
        null,

      check_out_date:
        check_out_date ||
        null,

      adults:
        Number(adults),

      children:
        Number(children),

      rooms:
        Number(rooms)

    },


    /*
     * -----------------------------------------------------
     * PAGINATION
     * -----------------------------------------------------
     */

    offset:
      requestedOffset,

    limit:
      requestedLimit,

    count:
      hotels.length,

    has_more:
      hasMore,

    next_offset:
      nextOffset,

    next_page_token:
      hasMore
        ? lastNextPageToken
        : null,


    /*
     * -----------------------------------------------------
     * HOTELS
     * -----------------------------------------------------
     */

    hotels,


    /*
     * -----------------------------------------------------
     * META
     * -----------------------------------------------------
     */

    meta: {

      target_page_size:
        requestedLimit,

      requested_offset:
        requestedOffset,

      pages_fetched:
        pagesFetched,

      qualifying_properties_skipped:
        qualifyingPropertiesSkipped,

      qualifying_properties_returned:
        hotels.length,

      has_more:
        hasMore,

      search_id:
        lastSerpApiDataSearchId(
          null
        ),

      status:
        "success"

    }

  });

}


/*
 * =========================================================
 * SERPAPI SEARCH ID HELPER
 * =========================================================
 *
 * Kept separate so the normalizer/API remains safe if
 * SerpApi metadata changes.
 * =========================================================
 */

function lastSerpApiDataSearchId(
  data
) {

  return (
    data
      ?.search_metadata
      ?.id ||
    null
  );

}


/*
 * =========================================================
 * HOTEL NORMALIZER
 * =========================================================
 */

function normalizeHotel(
  hotel,
  index,
  destination
) {

  /*
   * -------------------------------------------------------
   * PRICE
   * -------------------------------------------------------
   */

  const rate =
    hotel.rate_per_night ||
    {};


  const totalRate =
    hotel.total_rate ||
    {};


  const nightlyPrice =
    Number(
      rate.extracted_lowest ||
      rate.extracted_before_taxes_fees ||
      0
    );


  const totalPrice =
    Number(
      totalRate.extracted_lowest ||
      0
    );


  const originalPrice =
    Number(
      rate.extracted_before_taxes_fees ||
      0
    );


  /*
   * -------------------------------------------------------
   * STARS
   * -------------------------------------------------------
   */

  let stars =
    Number(
      hotel.extracted_hotel_class ||
      0
    );


  if (
    !stars &&
    hotel.hotel_class
  ) {

    const match =
      String(
        hotel.hotel_class
      ).match(
        /(\d+)/
      );


    if (match) {

      stars =
        Number(
          match[1]
        );

    }

  }


  /*
   * -------------------------------------------------------
   * RATING
   * -------------------------------------------------------
   */

  const rating =
    Number(
      hotel.overall_rating ||
      0
    );


  /*
   * -------------------------------------------------------
   * REVIEWS
   * -------------------------------------------------------
   */

  const reviews =
    Number(
      hotel.reviews ||
      0
    );


  /*
   * -------------------------------------------------------
   * IMAGES
   * -------------------------------------------------------
   */

  const images =
    Array.isArray(
      hotel.images
    )
      ? hotel.images
          .map(function (image) {

            return (
              image.original_image ||
              image.thumbnail ||
              null
            );

          })
          .filter(Boolean)
      : [];


  const primaryImage =
    images[0] ||
    hotel.thumbnail ||
    hotel.image ||
    "";


  /*
   * -------------------------------------------------------
   * AMENITIES
   * -------------------------------------------------------
   */

  const rawAmenities =
    Array.isArray(
      hotel.amenities
    )
      ? hotel.amenities
      : [];


  const amenities =
    rawAmenities.map(
      function (item) {

        if (
          typeof item === "string"
        ) {

          return item;

        }


        if (
          item &&
          typeof item.name === "string"
        ) {

          return item.name;

        }


        return "";

      }
    )
      .filter(Boolean);


  const normalizedAmenities =
    amenities.map(
      function (item) {

        return item
          .toLowerCase()
          .trim();

      }
    );


  /*
   * -------------------------------------------------------
   * AMENITY KEYS
   * -------------------------------------------------------
   */

  const amenityKeys = [];


  normalizedAmenities.forEach(
    function (amenity) {

      if (
        amenity.includes("wi-fi") ||
        amenity.includes("wifi") ||
        amenity.includes("internet")
      ) {

        amenityKeys.push(
          "wifi"
        );

      }


      if (
        amenity.includes("pool") ||
        amenity.includes("swimming")
      ) {

        amenityKeys.push(
          "pool"
        );

      }


      if (
        amenity.includes("parking") ||
        amenity.includes("car park")
      ) {

        amenityKeys.push(
          "parking"
        );

      }


      if (
        amenity.includes("restaurant") ||
        amenity.includes("dining")
      ) {

        amenityKeys.push(
          "restaurant"
        );

      }


      if (
        amenity.includes("gym") ||
        amenity.includes("fitness")
      ) {

        amenityKeys.push(
          "gym"
        );

      }

    }
  );


  /*
   * Remove duplicates.
   */

  const uniqueAmenityKeys =
    Array.from(
      new Set(
        amenityKeys
      )
    );


  /*
   * -------------------------------------------------------
   * LOCATION
   * -------------------------------------------------------
   */

  const address =
    hotel.address ||
    hotel.location ||
    destination;


  /*
   * -------------------------------------------------------
   * FREE CANCELLATION
   * -------------------------------------------------------
   */

  const freeCancellation =
    Boolean(
      hotel.free_cancellation
    ) ||
    Boolean(
      hotel.free_cancellation_policy
    ) ||
    Boolean(
      hotel.cancellation_policy
    ) ||
    Boolean(
      hotel.rate_per_night?.free_cancellation
    );


  /*
   * -------------------------------------------------------
   * RATING LABEL
   * -------------------------------------------------------
   */

  let ratingLabel =
    "";


  if (rating >= 9) {

    ratingLabel =
      "Exceptional";

  }

  else if (rating >= 8) {

    ratingLabel =
      "Excellent";

  }

  else if (rating >= 7) {

    ratingLabel =
      "Good";

  }

  else if (rating >= 6) {

    ratingLabel =
      "Pleasant";

  }

  else if (rating > 0) {

    ratingLabel =
      "Rated";

  }


  /*
   * -------------------------------------------------------
   * DEAL
   * -------------------------------------------------------
   */

  const deal =
    hotel.deal ||
    "";


  const dealDescription =
    hotel.deal_description ||
    "";


  /*
   * -------------------------------------------------------
   * PROPERTY TOKEN
   * -------------------------------------------------------
   */

  const propertyToken =
    hotel.property_token ||
    null;


  /*
   * -------------------------------------------------------
   * GPS
   * -------------------------------------------------------
   */

  const gps =
    hotel.gps_coordinates ||
    {};


  /*
   * -------------------------------------------------------
   * SOURCE PRICES
   * -------------------------------------------------------
   */

  const prices =
    Array.isArray(
      hotel.prices
    )
      ? hotel.prices.map(
          function (price) {

            return {

              source:
                price.source ||
                "",

              logo:
                price.logo ||
                "",

              link:
                price.link ||
                null,

              rate_per_night:
                price.rate_per_night ||
                null,

              total_rate:
                price.total_rate ||
                null

            };

          }
        )
      : [];


  /*
   * -------------------------------------------------------
   * RETURN FRONTEND OBJECT
   * -------------------------------------------------------
   */

  return {

    id:
      propertyToken ||
      `hotel-${index + 1}`,

    property_token:
      propertyToken,

    position:
      index + 1,

    type:
      hotel.type ||
      "hotel",

    name:
      hotel.name ||
      "Hotel",

    description:
      hotel.description ||
      "",

    address,

    destination,

    stars,

    hotel_class:
      hotel.hotel_class ||
      `${stars}-star hotel`,

    rating,

    rating_label:
      ratingLabel,

    reviews,

    review_count:
      reviews,

    location_rating:
      Number(
        hotel.location_rating ||
        0
      ),

    price_per_night:
      nightlyPrice,

    price_per_night_formatted:
      rate.lowest ||
      "",

    price_before_taxes:
      originalPrice,

    price_before_taxes_formatted:
      rate.before_taxes_fees ||
      "",

    total_price:
      totalPrice,

    total_price_formatted:
      totalRate.lowest ||
      "",

    total_price_before_taxes:
      Number(
        totalRate.extracted_before_taxes_fees ||
        0
      ),

    total_price_before_taxes_formatted:
      totalRate.before_taxes_fees ||
      "",

    images,

    image:
      primaryImage,

    image_count:
      images.length,

    thumbnail:
      hotel.images?.[0]?.thumbnail ||
      primaryImage,

    amenities,

    amenity_keys:
      uniqueAmenityKeys,

    free_cancellation:
      freeCancellation,

    free_cancellation_text:
      freeCancellation
        ? "Free cancellation"
        : "",

    deal,

    deal_description:
      dealDescription,

    sponsored:
      Boolean(
        hotel.sponsored
      ),

    logo:
      hotel.logo ||
      "",

    gps: {

      latitude:
        Number(
          gps.latitude ||
          0
        ),

      longitude:
        Number(
          gps.longitude ||
          0
        )

    },

    check_in_time:
      hotel.check_in_time ||
      "",

    check_out_time:
      hotel.check_out_time ||
      "",

    nearby_places:
      Array.isArray(
        hotel.nearby_places
      )
        ? hotel.nearby_places
        : [],

    prices,

    ratings:
      Array.isArray(
        hotel.ratings
      )
        ? hotel.ratings
        : [],

    reviews_breakdown:
      Array.isArray(
        hotel.reviews_breakdown
      )
        ? hotel.reviews_breakdown
        : [],

    link:
      hotel.link ||
      null

  };

}
