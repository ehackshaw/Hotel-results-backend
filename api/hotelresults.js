/**
 * =========================================================
 * BOKKARA HOTELS API
 * =========================================================
 *
 * Backend proxy for SerpApi Google Hotels.
 *
 * PAGINATION:
 *
 *   offset=0   -> hotels 1-20
 *   offset=20  -> hotels 21-40
 *   offset=40  -> hotels 41-60
 *   offset=60  -> hotels 61-80
 *
 * The FRONTEND uses offset.
 *
 * SerpApi next_page_token is used INTERNALLY by this backend
 * to continue through SerpApi result pages.
 *
 * The frontend does NOT need to control SerpApi pagination.
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
 *   &offset=0
 *
 * =========================================================
 *
 * Environment variable:
 *
 * SERPAPI_KEY=YOUR_SERPAPI_KEY
 *
 * =========================================================
 */

export default async function handler(req, res) {

  /*
   * =======================================================
   * CORS
   * =======================================================
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
   * =======================================================
   * API KEY
   * =======================================================
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
   * =======================================================
   * REQUEST PARAMETERS
   * =======================================================
   *
   * IMPORTANT:
   *
   * next_page_token is intentionally NOT used as the
   * frontend pagination mechanism.
   *
   * Offset controls Bokkara pagination.
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

    property_types

  } = req.query;


  /*
   * =======================================================
   * DESTINATION
   * =======================================================
   */

  const searchQuery =
    destination ||
    q ||
    "Port of Spain";


  if (!searchQuery) {

    return res.status(400).json({

      success: false,

      error:
        "A destination is required."

    });

  }


  /*
   * =======================================================
   * BOKKARA PAGINATION
   * =======================================================
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
   * ALWAYS RETURN 20.
   */

  const requestedLimit = 20;


  /*
   * =======================================================
   * SERPAPI PAGE SAFETY
   * =======================================================
   *
   * We may need several SerpApi pages to:
   *
   * - skip the requested offset
   * - find 20 qualifying hotels
   * - pass filters
   * - remove duplicates
   *
   */

  const MAX_SERPAPI_PAGES = 50;


  /*
   * =======================================================
   * SERPAPI BASE PARAMETERS
   * =======================================================
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
   * =======================================================
   * DATES
   * =======================================================
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
   * =======================================================
   * GUESTS
   * =======================================================
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
   * =======================================================
   * LOCALIZATION
   * =======================================================
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
   * =======================================================
   * SORTING
   * =======================================================
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

  /*
   * price-high and stars are sorted locally after
   * qualifying hotels are collected.
   */


  /*
   * =======================================================
   * PRICE FILTERS
   * =======================================================
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
   * =======================================================
   * RATING FILTER
   * =======================================================
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
   * =======================================================
   * STAR FILTER
   * =======================================================
   */

  if (stars) {

    const validStars =
      String(stars)
        .split(",")
        .map(function (value) {

          return value.trim();

        })
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
   * =======================================================
   * AMENITIES
   * =======================================================
   */

  const amenityMap = {

    wifi: "35",

    pool: "9",

    parking: "19",

    restaurant: "14",

    gym: "7"

  };


  const requestedAmenities =
    amenities
      ? String(amenities)
          .split(",")
          .map(function (item) {

            return item
              .trim()
              .toLowerCase();

          })
          .filter(Boolean)
      : [];


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


  /*
   * =======================================================
   * FREE CANCELLATION
   * =======================================================
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
   * =======================================================
   * SPECIAL OFFERS
   * =======================================================
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
   * =======================================================
   * PROPERTY TYPES
   * =======================================================
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
   *
   * IMPORTANT:
   *
   * We ALWAYS start from the first SerpApi page when the
   * frontend sends an offset.
   *
   * SerpApi pagination is then followed internally.
   *
   * This means:
   *
   * offset=0
   *   -> start page 1
   *
   * offset=20
   *   -> start page 1, skip first 20 qualifying hotels
   *
   * offset=40
   *   -> start page 1, skip first 40 qualifying hotels
   *
   * This prevents the old bug where offset=20 and a
   * next_page_token were both applied.
   */

  let currentPageToken = null;


  let pagesFetched = 0;


  let qualifyingPropertiesSkipped = 0;


  let allUsableProperties = [];


  let reachedEnd = false;


  let lastNextPageToken = null;


  /*
   * Prevent duplicate properties across SerpApi pages.
   */

  const seenProperties =
    new Set();


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
     * BUILD CURRENT SERPAPI REQUEST
     * -----------------------------------------------------
     */

    const pageParams =
      new URLSearchParams(
        params.toString()
      );


    /*
     * -----------------------------------------------------
     * INTERNAL SERPAPI TOKEN
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


    let response;


    try {

      response =
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

    }

    catch (networkError) {

      return res.status(502).json({

        success: false,

        error:
          "Unable to connect to SerpApi.",

        details:
          networkError.message

      });

    }


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
     * =====================================================
     * SERPAPI HTTP ERROR
     * =====================================================
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
     * =====================================================
     * SERPAPI API ERROR
     * =====================================================
     */

    if (data.error) {

      return res.status(400).json({

        success: false,

        error:
          data.error,

        serpapi:
          data

      });

    }


    /*
     * =====================================================
     * PROPERTIES
     * =====================================================
     */

    const pageProperties =
      Array.isArray(
        data.properties
      )
        ? data.properties
        : [];


    /*
     * =====================================================
     * NEXT SERPAPI TOKEN
     * =====================================================
     */

    const pageNextToken =
      data.next_page_token ||
      null;


    /*
     * =====================================================
     * PROCESS HOTELS
     * =====================================================
     */

    for (
      const hotel of pageProperties
    ) {

      /*
       * ---------------------------------------------------
       * PROPERTY KEY
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
       * ---------------------------------------------------
       * DUPLICATE CHECK
       * ---------------------------------------------------
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
       * PRICE
       * ===================================================
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
       * ===================================================
       * IMAGE
       * ===================================================
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
       * ===================================================
       * STARS
       * ===================================================
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
       * ===================================================
       * BASIC QUALITY FILTER
       * ===================================================
       */

      if (
        !hasPrice ||
        !hasImage ||
        !hasStars
      ) {

        continue;

      }


      /*
       * ===================================================
       * NORMALIZE TEMPORARILY
       * ===================================================
       *
       * We normalize BEFORE pagination so all local filters
       * are applied before offset counting.
       */

      const normalizedHotel =
        normalizeHotel(
          hotel,
          0,
          searchQuery
        );


      /*
       * ===================================================
       * LOCAL AMENITY FILTER
       * ===================================================
       */

      if (
        requestedAmenities.length
      ) {

        const hasRequiredAmenities =
          requestedAmenities.every(
            function (required) {

              return normalizedHotel
                .amenity_keys
                .includes(required);

            }
          );


        if (
          !hasRequiredAmenities
        ) {

          continue;

        }

      }


      /*
       * ===================================================
       * FREE CANCELLATION FILTER
       * ===================================================
       */

      if (
        free_cancellation === "true" &&
        normalizedHotel.free_cancellation !== true
      ) {

        continue;

      }


      /*
       * ===================================================
       * PRICE RANGE FILTER
       * ===================================================
       */

      if (
        req.query.price_range
      ) {

        const ranges =
          String(
            req.query.price_range
          )
            .split(",")
            .map(function (item) {

              return item.trim();

            })
            .filter(Boolean);


        const price =
          Number(
            normalizedHotel.price_per_night
          );


        const matchesPriceRange =
          ranges.some(
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


        if (
          !matchesPriceRange
        ) {

          continue;

        }

      }


      /*
       * ===================================================
       * MARK AS SEEN
       * ===================================================
       *
       * Only mark a property as seen once it passes ALL
       * filters that affect pagination.
       */

      seenProperties.add(
        propertyKey
      );


      /*
       * ===================================================
       * OFFSET
       * ===================================================
       *
       * THIS IS THE IMPORTANT FIX.
       *
       * offset=0:
       *   return immediately
       *
       * offset=20:
       *   skip first 20 qualifying hotels
       *
       * offset=40:
       *   skip first 40 qualifying hotels
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
       * ADD HOTEL
       * ===================================================
       */

      allUsableProperties.push(
        hotel
      );


      /*
       * Stop once we have 20.
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
     * BATCH COMPLETE
     * =====================================================
     */

    if (
      allUsableProperties.length >=
      requestedLimit
    ) {

      lastNextPageToken =
        pageNextToken;

      break;

    }


    /*
     * =====================================================
     * SERPAPI HAS NO MORE PAGES
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
   * NORMALIZE FINAL PROPERTIES
   * =======================================================
   */

  let hotels =
    allUsableProperties
      .slice(
        0,
        requestedLimit
      )
      .map(
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
   * LOCAL SORTING
   * =======================================================
   *
   * SerpApi handles price-low and normal rating sorting
   * where possible.
   *
   * These are handled locally:
   *
   * price-high
   * stars
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


  /*
   * =======================================================
   * FINAL SAFETY LIMIT
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
   * There are more results only if:
   *
   * 1. We have another SerpApi page
   * 2. We did not reach the end
   *
   * If SerpApi has no next_page_token, there are no more
   * hotels available.
   */

  const hasMore =
    Boolean(
      lastNextPageToken
    ) &&
    !reachedEnd;


  /*
   * =======================================================
   * NEXT OFFSET
   * =======================================================
   *
   * Normal sequence:
   *
   * offset 0  -> next 20
   * offset 20 -> next 40
   * offset 40 -> next 60
   *
   * If the final batch contains fewer than 20 hotels,
   * next_offset advances by the number actually returned.
   */

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
     * BOKKARA PAGINATION
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


    /*
     * IMPORTANT:
     *
     * This token is informational only.
     *
     * The frontend SHOULD NOT send it back.
     *
     * Bokkara pagination is controlled by next_offset.
     */

    next_page_token:
      null,


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

      serpapi_has_next_page:
        Boolean(
          lastNextPageToken
        ),

      status:
        "success"

    }

  });

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
    rawAmenities
      .map(
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
