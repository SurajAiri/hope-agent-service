const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3030/api/v1"

export class ApiError extends Error {
  status: number
  data: any

  constructor(status: number, message: string, data?: any) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function handleResponse(response: Response) {
  const isJson = response.headers.get("content-type")?.includes("application/json")
  const data = isJson ? await response.json() : null

  if (!response.ok) {
    const error = (data && data.message) || response.statusText
    throw new ApiError(response.status, error, data)
  }

  return data
}

function getHeaders(customHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...customHeaders,
  }

  // Only run in browser
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token")
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
  }

  return headers
}

export const api = {
  get: async (endpoint: string, customHeaders?: Record<string, string>) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "GET",
      headers: getHeaders(customHeaders),
    })
    return handleResponse(response)
  },

  post: async (endpoint: string, body?: any, customHeaders?: Record<string, string>) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: getHeaders(customHeaders),
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse(response)
  },

  put: async (endpoint: string, body?: any, customHeaders?: Record<string, string>) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "PUT",
      headers: getHeaders(customHeaders),
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse(response)
  },

  delete: async (endpoint: string, customHeaders?: Record<string, string>) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "DELETE",
      headers: getHeaders(customHeaders),
    })
    return handleResponse(response)
  },
}
