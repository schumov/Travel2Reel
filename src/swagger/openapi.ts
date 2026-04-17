export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Map Rendering API",
    version: "1.1.0",
    description:
      "API for map rendering, EXIF processing, Google authentication and persisted user route sessions."
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development"
    }
  ],
  tags: [
    { name: "Health", description: "Service health checks" },
    { name: "Auth", description: "Google authentication and session endpoints" },
    { name: "Map", description: "Public map rendering endpoints" },
    { name: "UserRoutes", description: "Authenticated route session persistence endpoints" }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check endpoint",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" }
                  },
                  required: ["status"]
                }
              }
            }
          }
        }
      }
    },
    "/auth/google": {
      get: {
        tags: ["Auth"],
        summary: "Start Google OAuth login",
        responses: {
          "302": { description: "Redirect to Google" },
          "503": {
            description: "Google auth not configured",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/auth/google/callback": {
      get: {
        tags: ["Auth"],
        summary: "Google OAuth callback",
        responses: {
          "302": { description: "Redirect to frontend after auth" },
          "503": {
            description: "Google auth not configured",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current auth session",
        responses: {
          "200": {
            description: "Auth state",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    authenticated: { type: "boolean" },
                    guest: { type: "boolean" },
                    user: {
                      type: "object",
                      nullable: true,
                      properties: {
                        id: { type: "string" },
                        email: { type: "string" },
                        displayName: { type: "string" },
                        avatarUrl: { type: "string", nullable: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/auth/guest": {
      post: {
        tags: ["Auth"],
        summary: "Create guest session via signed cookie",
        responses: {
          "201": {
            description: "Guest session created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    authenticated: { type: "boolean", example: true },
                    guest: { type: "boolean", example: true },
                    user: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        email: { type: "string" },
                        displayName: { type: "string" },
                        avatarUrl: { type: "string", nullable: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout current session",
        responses: {
          "200": {
            description: "Logout successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } }
                }
              }
            }
          }
        }
      }
    },
    "/api/map/render": {
      get: {
        tags: ["Map"],
        summary: "Render map PNG by coordinates",
        parameters: [
          { name: "lat", in: "query", required: true, schema: { type: "number", format: "double" } },
          { name: "lng", in: "query", required: true, schema: { type: "number", format: "double" } },
          { name: "zoom", in: "query", schema: { type: "integer", minimum: 1, maximum: 19, default: 13 } },
          { name: "width", in: "query", schema: { type: "integer", minimum: 256, maximum: 2000, default: 800 } },
          { name: "height", in: "query", schema: { type: "integer", minimum: 256, maximum: 2000, default: 600 } }
        ],
        responses: {
          "200": {
            description: "PNG image generated successfully",
            content: {
              "image/png": {
                schema: { type: "string", format: "binary" }
              }
            }
          },
          "400": {
            description: "Validation error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          },
          "500": {
            description: "Unexpected server error",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          }
        }
      }
    },
    "/api/map/cache/health": {
      get: {
        tags: ["Map"],
        summary: "Get map cache backend health",
        responses: {
          "200": {
            description: "Cache backend status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    backend: { type: "string", enum: ["memory", "redis"] }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/getmap": {
      post: {
        tags: ["Map"],
        summary: "Render map PNG from uploaded image GPS EXIF",
        requestBody: {
          required: true,
          content: {
            "application/octet-stream": { schema: { type: "string", format: "binary" } },
            "image/jpeg": { schema: { type: "string", format: "binary" } },
            "image/png": { schema: { type: "string", format: "binary" } }
          }
        },
        responses: {
          "200": {
            description: "PNG image generated successfully",
            content: {
              "image/png": {
                schema: { type: "string", format: "binary" }
              }
            }
          },
          "400": {
            description: "Missing or invalid EXIF/GPS data",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          }
        }
      }
    },
    "/api/getinfo": {
      post: {
        tags: ["Map"],
        summary: "Get web location info from image GPS EXIF",
        requestBody: {
          required: true,
          content: {
            "application/octet-stream": { schema: { type: "string", format: "binary" } },
            "image/jpeg": { schema: { type: "string", format: "binary" } },
            "image/png": { schema: { type: "string", format: "binary" } }
          }
        },
        responses: {
          "200": {
            description: "Location info resolved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    gps: {
                      type: "object",
                      properties: {
                        lat: { type: "number", format: "double" },
                        lng: { type: "number", format: "double" }
                      }
                    },
                    displayName: { type: "string" },
                    city: { type: "string" },
                    country: { type: "string" },
                    wikiTitle: { type: "string" },
                    wikiExtract: { type: "string" },
                    wikiUrl: { type: "string" }
                  }
                }
              }
            }
          },
          "400": {
            description: "Missing or invalid EXIF/GPS data",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          }
        }
      }
    },
    "/api/getroute": {
      post: {
        tags: ["Map"],
        summary: "Render route PNG between two EXIF GPS images",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["startImage", "endImage"],
                properties: {
                  startImage: { type: "string", format: "binary" },
                  endImage: { type: "string", format: "binary" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "PNG route image generated successfully",
            content: {
              "image/png": {
                schema: { type: "string", format: "binary" }
              }
            }
          },
          "400": {
            description: "Invalid upload or missing GPS EXIF",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          }
        }
      }
    },
    "/api/getroute-set": {
      post: {
        tags: ["Map"],
        summary: "Render ordered route PNG from multiple EXIF GPS images",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["images"],
                properties: {
                  images: {
                    type: "array",
                    items: { type: "string", format: "binary" }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "PNG route image generated successfully",
            content: {
              "image/png": {
                schema: { type: "string", format: "binary" }
              }
            }
          },
          "400": {
            description: "Invalid upload or missing GPS EXIF",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          }
        }
      }
    },
    "/api/user/routes": {
      get: {
        tags: ["UserRoutes"],
        summary: "List current user route sessions",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": {
            description: "Route sessions list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    routeSessions: {
                      type: "array",
                      items: { $ref: "#/components/schemas/RouteSession" }
                    }
                  }
                }
              }
            }
          },
          "401": {
            description: "Authentication required",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          }
        }
      },
      post: {
        tags: ["UserRoutes"],
        summary: "Create new route session",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Route session created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    routeSession: { $ref: "#/components/schemas/RouteSession" }
                  }
                }
              }
            }
          },
          "401": {
            description: "Authentication required",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          }
        }
      }
    },
    "/api/user/routes/{routeId}": {
      get: {
        tags: ["UserRoutes"],
        summary: "Get route session details",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "routeId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Route session details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    routeSession: { type: "object" }
                  }
                }
              }
            }
          },
          "401": { description: "Authentication required" },
          "403": { description: "Forbidden" },
          "404": { description: "Route not found" }
        }
      },
      patch: {
        tags: ["UserRoutes"],
        summary: "Rename route session display name",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "routeId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string", minLength: 2, maxLength: 120 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Route session renamed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    routeSession: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        updatedAt: { type: "string", format: "date-time" }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": { description: "Invalid payload" },
          "401": { description: "Authentication required" },
          "403": { description: "Forbidden" },
          "404": { description: "Route not found" }
        }
      },
      delete: {
        tags: ["UserRoutes"],
        summary: "Delete route session and assets",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "routeId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Route deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true } }
                }
              }
            }
          },
          "401": { description: "Authentication required" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" }
        }
      }
    },
    "/api/user/routes/{routeId}/images": {
      post: {
        tags: ["UserRoutes"],
        summary: "Upload images into a route session",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "routeId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  images: {
                    type: "array",
                    items: { type: "string", format: "binary" }
                  }
                },
                required: ["images"]
              }
            }
          }
        },
        responses: {
          "201": { description: "All images uploaded" },
          "207": { description: "Partial upload (some images failed)" },
          "400": {
            description: "Invalid payload",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          },
          "401": { description: "Authentication required" },
          "403": { description: "Forbidden" }
        }
      }
    },
    "/api/user/routes/{routeId}/images/{imageId}/note": {
      patch: {
        tags: ["UserRoutes"],
        summary: "Update user note for a persisted route image",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "routeId", in: "path", required: true, schema: { type: "string" } },
          { name: "imageId", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  userNote: { type: "string", maxLength: 5000 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Image note updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    image: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        userNote: { type: "string", nullable: true }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            description: "Invalid payload",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          },
          "401": { description: "Authentication required" },
          "403": { description: "Forbidden" },
          "404": { description: "Image not found" }
        }
      }
    },
    "/api/user/routes/{routeId}/images/{imageId}/summary": {
      post: {
        tags: ["UserRoutes"],
        summary: "Generate AI summary for a route image using Claude",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "routeId", in: "path", required: true, schema: { type: "string" } },
          { name: "imageId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": {
            description: "AI summary generated and saved",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    image: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        aiSummary: { type: "string", nullable: true }
                      }
                    }
                  }
                }
              }
            }
          },
          "401": { description: "Authentication required" },
          "403": { description: "Forbidden" },
          "404": { description: "Image not found" },
          "503": {
            description: "Claude AI not configured",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          }
        }
      },
      patch: {
        tags: ["UserRoutes"],
        summary: "Update AI-generated summary for a persisted route image",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "routeId", in: "path", required: true, schema: { type: "string" } },
          { name: "imageId", in: "path", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  aiSummary: { type: "string", maxLength: 1000 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Image summary updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    image: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        aiSummary: { type: "string", nullable: true }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            description: "Invalid payload",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          },
          "401": { description: "Authentication required" },
          "403": { description: "Forbidden" },
          "404": { description: "Image not found" }
        }
      }
    },
    "/api/user/routes/{routeId}/generate": {
      post: {
        tags: ["UserRoutes"],
        summary: "Generate final route map from persisted route images",
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: "routeId", in: "path", required: true, schema: { type: "string" } },
          { name: "width", in: "query", schema: { type: "integer" } },
          { name: "height", in: "query", schema: { type: "integer" } }
        ],
        responses: {
          "200": {
            description: "Route generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    routeAsset: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        url: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            description: "Invalid route data",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
          },
          "401": { description: "Authentication required" },
          "403": { description: "Forbidden" }
        }
      }
    },
    "/api/user/routes/{routeId}/route-map": {
      get: {
        tags: ["UserRoutes"],
        summary: "Download latest generated route map PNG",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "routeId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "PNG route map",
            content: {
              "image/png": {
                schema: { type: "string", format: "binary" }
              }
            }
          },
          "401": { description: "Authentication required" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" }
        }
      }
    },
    "/api/user/assets/{assetId}": {
      get: {
        tags: ["UserRoutes"],
        summary: "Download persisted asset by id",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "assetId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Binary asset stream" },
          "401": { description: "Authentication required" },
          "403": { description: "Forbidden" },
          "404": { description: "Asset not found" }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "connect.sid"
      }
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", example: "Authentication required" }
        },
        required: ["error"]
      },
      RouteSession: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          status: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      }
    }
  }
} as const;
