/**
 * =========================================================
 * BOKKARA HOTELS API
 * =========================================================
 *
 * Backend proxy for SerpApi Google Hotels.
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

    next_page_token,

    limit

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
   *
   * Shopify frontend:
   *
   * recommended
   * price-low
   * price-high
   * rating
   * stars
   *
   * SerpApi:
   *
   * 3  = Lowest price
   * 8  = Highest rating
   * 13 = Most reviewed
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
     * Google Hotels does not expose a
     * "highest price" sort through the
     * documented sort_by values.
     *
     * We therefore sort the returned
     * properties ourselves below.
     */

  }

  else if (sort === "stars") {

    /*
     * Star sorting is performed locally
     * after SerpApi returns the results.
     */

  }

  else if (sort === "recommended") {

    /*
     * Leave SerpApi's default relevance
     * ordering.
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
   *
   * Frontend:
   *
   * 7+
   * 8+
   * 9+
   *
   * SerpApi:
   *
   * 7 = 3.5+
   * 8 = 4.0+
   * 9 = 4.5+
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
   *
   * Frontend:
   *
   * 3
   * 4
   * 5
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
   *
   * The frontend sends normalized names:
   *
   * wifi
   * pool
   * parking
   * restaurant
   * gym
   *
   * SerpApi uses numeric amenity IDs.
   *
   * These IDs should be adjusted if your
   * SerpApi account returns different mappings.
   *
   * The backend also performs local filtering
   * so the frontend receives exactly what
   * it expects.
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
   * -------------------------------------------------------
   * PAGINATION
   * -------------------------------------------------------
   */

  if (next_page_token) {

    params.set(
      "next_page_token",
      String(next_page_token)
    );

  }


  /*
   * -------------------------------------------------------
   * FETCH SERPAPI
   * -------------------------------------------------------
   */

  const serpApiUrl =
    "https://serpapi.com/search?" +
    params.toString();


  try {

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


    const data =
      await response.json();


    /*
     * ---------------------------------------------------
     * SERPAPI ERROR
     * ---------------------------------------------------
     */

    if (!response.ok) {

      return res.status(
        response.status
      ).json({

        success: false,

        error:
          data.error ||
          "SerpApi request failed.",

        serpapi: data

      });

    }


    if (data.error) {

      return res.status(400).json({

        success: false,

        error: data.error

      });

    }


    /*
     * ---------------------------------------------------
     * PROPERTIES
     * ---------------------------------------------------
     */

    let properties =
      Array.isArray(
        data.properties
      )
        ? data.properties
        : [];


    /*
     * ---------------------------------------------------
     * NORMALIZE HOTEL DATA
     * ---------------------------------------------------
     */

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
     * ---------------------------------------------------
     * LOCAL AMENITY FILTER
     *
     * This makes the backend compatible with
     * the frontend's amenity filters even if
     * Google returns slightly different amenity
     * labels.
     * ---------------------------------------------------
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
     * ---------------------------------------------------
     * FREE CANCELLATION LOCAL FILTER
     * ---------------------------------------------------
     */

    if (
      free_cancellation === "true"
    ) {

      hotels =
        hotels.filter(
          function (hotel) {

            return hotel.free_cancellation === true;

          }
        );

    }


    /*
     * ---------------------------------------------------
     * PRICE RANGE FILTER
     *
     * Supports frontend ranges:
     *
     * under100
     * 100-200
     * 200-300
     * 300plus
     *
     * ---------------------------------------------------
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
     * ---------------------------------------------------
     * LOCAL SORTING
     * ---------------------------------------------------
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
     * ---------------------------------------------------
     * LIMIT
     * ---------------------------------------------------
     */

    const requestedLimit =
      Number(limit);


    if (
      requestedLimit > 0
    ) {

      hotels =
        hotels.slice(
          0,
          Math.min(
            requestedLimit,
            100
          )
        );

    }


    /*
     * ---------------------------------------------------
     * RESPONSE
     * ---------------------------------------------------
     */

    return res.status(200).json({

      success: true,

      destination:
        searchQuery,

      search: {

        check_in_date:
          check_in_date || null,

        check_out_date:
          check_out_date || null,

        adults:
          Number(adults),

        children:
          Number(children),

        rooms:
          Number(rooms)

      },

      count:
        hotels.length,

      next_page_token:
        data.next_page_token ||
        null,

      hotels,

      /*
       * Useful when debugging SerpApi
       * without exposing the API key.
       */

      meta: {

        search_id:
          data.search_metadata?.id ||
          null,

        status:
          data.search_metadata?.status ||
          null

      }

    });

  }

  catch (error) {

    console.error(
      "Bokkara Hotels API Error:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        "Unable to retrieve hotel results.",

      message:
        error.message

    });

  }

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
    hotel.rate_per_night || {};


  const totalRate =
    hotel.total_rate || {};


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


  if (!stars && hotel.hotel_class) {

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
   *
   * FIX:
   * Use the actual hotel address returned by SerpApi.
   *
   * IMPORTANT:
   * Do NOT fall back to the search destination.
   * Searching "New York" must not make the address
   * display as "New York".
   * -------------------------------------------------------
   */

  let address = "";


  /*
   * Direct address fields.
   */

  if (
    typeof hotel.address === "string" &&
    hotel.address.trim()
  ) {

    address =
      hotel.address.trim();

  }


  if (
    !address &&
    typeof hotel.formatted_address === "string" &&
    hotel.formatted_address.trim()
  ) {

    address =
      hotel.formatted_address.trim();

  }


  if (
    !address &&
    typeof hotel.full_address === "string" &&
    hotel.full_address.trim()
  ) {

    address =
      hotel.full_address.trim();

  }


  if (
    !address &&
    typeof hotel.street_address === "string" &&
    hotel.street_address.trim()
  ) {

    address =
      hotel.street_address.trim();

  }


  if (
    !address &&
    typeof hotel.address_line === "string" &&
    hotel.address_line.trim()
  ) {

    address =
      hotel.address_line.trim();

  }


  if (
    !address &&
    typeof hotel.addressLine === "string" &&
    hotel.addressLine.trim()
  ) {

    address =
      hotel.addressLine.trim();

  }


  /*
   * Location can sometimes be returned as a string.
   */

  if (
    !address &&
    typeof hotel.location === "string" &&
    hotel.location.trim()
  ) {

    address =
      hotel.location.trim();

  }


  /*
   * Location can sometimes be returned as an object.
   */

  if (
    !address &&
    hotel.location &&
    typeof hotel.location === "object"
  ) {

    const locationAddress =
      hotel.location.address ||
      hotel.location.formatted_address ||
      hotel.location.full_address ||
      hotel.location.street_address ||
      hotel.location.address_line ||
      hotel.location.addressLine ||
      "";

    if (
      typeof locationAddress === "string" &&
      locationAddress.trim()
    ) {

      address =
        locationAddress.trim();

    }

  }


  /*
   * IMPORTANT:
   *
   * There is intentionally NO:
   *
   *   || destination
   *
   * here.
   *
   * The search destination is not the hotel's
   * actual address.
   */


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
    hotel.gps_coordinates || {};


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
