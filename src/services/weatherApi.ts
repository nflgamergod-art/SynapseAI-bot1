interface WeatherResponse {
  location: {
    name: string;
    region: string;
  };
  current: {
    temp_c: number;
    temp_f: number;
    condition: {
      text: string;
    };
    humidity: number;
    wind_kph: number;
  };
  error?: {
    message: string;
  };
}

const API_KEY = process.env.WEATHER_API_KEY;
const BASE_URL = 'http://api.weatherapi.com/v1';

export async function getWeather(searchLocation: string): Promise<string> {
  if (!API_KEY) {
    return "Sorry, I can't check the weather right now. My weather service is not configured.";
  }

  try {
    const response = await fetch(`${BASE_URL}/current.json?key=${API_KEY}&q=${encodeURIComponent(searchLocation)}`);
    const data = await response.json() as WeatherResponse;

    if (data.error) {
      return "I couldn't find weather information for that location.";
    }

    const current = data.current;
    const location = data.location;
    
    return `In ${location.name}, ${location.region} it's currently ${current.temp_c}°C (${current.temp_f}°F) and ${current.condition.text.toLowerCase()}. The humidity is ${current.humidity}% with a wind speed of ${current.wind_kph} km/h.`;
  } catch (err) {
    console.error('Weather API error:', err);
    return "Sorry, I couldn't fetch the weather information right now.";
  }
}