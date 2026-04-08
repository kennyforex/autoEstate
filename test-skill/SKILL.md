---
name: car-wash-estimator
description: >-
  Provides quick price estimates ONLY for car washing services.
  Use ONLY for pricing or estimate queries like "how much", "price", "estimate", 洗車, 報價.
  If the user wants to BOOK or schedule, do not complete this skill — route to the booking skill instead.
argument-hint: "[vehicle type and wash package]"
user-invocable: true
metadata:
  display_name: Car Wash Estimator
  version: 1.0.0
  category: demo
  language: en
  reminder_delay: 0
  max_reminders: 0
  trigger_hints:
    - car wash
    - wash price
    - estimate
    - 洗車
    - 報價
steps:
  - id: vehicle
    label: Get vehicle type (sedan, SUV, truck, van, motorcycle)
    collects: vehicle_type
  - id: service
    label: Get wash package (basic, premium, deluxe)
    collects: wash_package
  - id: estimate
    label: Calculate and present price estimate
    collects: estimated_price
---

## Car Wash Price Estimator

**CRITICAL: SCOPE ENFORCEMENT** (read this first, before any other instructions):

1. Scan the user message for booking words: "book", "booking", "schedule", "appointment", "reserve", "預約", "i want to book", "want to book", "booking car".
2. If **ANY** booking word is present, **IMMEDIATELY** (before any other response) output exactly:
   UNHANDLED_INTENT: user wants to book the car wash service
3. Only if there are no booking words, then proceed with price estimation.

You help customers get a quick price estimate for car washing services. Do not collect vehicle or service info if booking intent is present.

### Steps

1. Ask the customer what **vehicle type** they have (sedan, SUV, truck, van, motorcycle).
2. Ask which **services** they want (pick one or more):
   - Basic exterior wash
   - Interior cleaning
   - Full detail (exterior + interior + wax)
   - Engine bay cleaning
3. Once you have vehicle type + services, run the `estimate_price.py` script to calculate the price.
   - Pass the vehicle type as arg1 and service codes as arg2 (comma-separated: `basic`, `interior`, `full`, `engine`).
4. Present the price breakdown to the customer.
5. Ask if they'd like to proceed with booking.

### Important

- **SCOPE**: This skill is ONLY for pricing/estimation queries. If the user says "book", "booking", "schedule", "appointment" or wants to make a reservation, respond with:
  UNHANDLED_INTENT: user wants to book the car wash service
- If you're unsure about available services or pricing tiers, use `LOAD_REFERENCE` to check the pricing table.
- Always show the price in HKD.
- The script handles all pricing logic — do NOT make up prices.
