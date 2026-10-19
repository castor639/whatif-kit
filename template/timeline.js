// Every shot is what you see from where you stand. look: [t, yawDeg, pitchDeg] head offsets.
export const TIMELINE = {
  "duration": 60,
  "startHour": 22,
  "shutter": 0.55,
  "keys": [
    [0, 0], [5, 0], [11, 0.6], [16.5, 8], [22, 24], [27.5, 72], [33, 94.7], [36.5, 99.5],
    [39.5, 109.1], [43.5, 114.16], [48.5, 115.24], [53.4, 115.56], [54.4, 115.6127]
  ],
  "shots": [
    { "start": 0, "place": "street", "look": [[0, 0, -4], [4.5, 0, 2]] },
    { "start": 5.5, "place": "rooftop", "look": [[5.5, 14, -6], [9.5, 4, 0], [14, 0, 4]] },
    { "start": 16.2, "place": "street", "look": [[16.2, 0, 4], [27, 0, 6]] },
    { "start": 27.5, "place": "beach", "look": [[27.5, 0, -6], [30.5, 6, -2], [33, 0, 4]] },
    { "start": 33.2, "place": "field", "look": [[33.2, 30, -2], [36.5, 8, 2], [39.5, 0, 4]] },
    { "start": 39.5, "place": "rooftop", "look": [[39.5, -10, 2], [43.6, 0, 8]] },
    { "start": 43.6, "place": "field", "look": [[43.6, 0, 6], [48.8, 0, 14]] },
    { "start": 49.0, "place": "street", "look": [[49, 0, 10], [51.5, -6, 16], [53.8, 4, 4]] },
    { "start": 54.0, "place": "end" }
  ],
  "captions": [
    [5.9, 10.9, "The Moon only stays up because it's moving sideways, at 3,700 km/h."],
    [11.2, 16.0, "Take that away, and it starts to fall."],
    [16.6, 21.6, "For the first day, you'd barely notice."],
    [22.2, 27.2, "Day three. It's falling faster every hour."],
    [27.8, 32.9, "Halfway down, the tides are eight times higher."],
    [33.6, 39.2, "Its light at night is now four times a full Moon."],
    [39.9, 43.4, "Ten times closer than it should be."],
    [43.9, 48.8, "At about 18,000 km, Earth's tides start pulling it apart."],
    [49.3, 53.7, "It never lands in one piece."]
  ],
  "breakStart": 46.0,
  "breakEnd": 53.8
};
