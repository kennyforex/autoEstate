import sys
import json

PRICES = {
    "motorcycle": {"basic": 80, "interior": 0, "full": 200, "engine": 60},
    "sedan":      {"basic": 150, "interior": 200, "full": 580, "engine": 120},
    "suv":        {"basic": 200, "interior": 280, "full": 780, "engine": 150},
    "truck":      {"basic": 220, "interior": 300, "full": 850, "engine": 180},
    "van":        {"basic": 250, "interior": 320, "full": 900, "engine": 180},
}

MULTI_SERVICE_DISCOUNT = 0.10

def estimate(vehicle_type, service_codes):
    vehicle = vehicle_type.lower().strip()
    if vehicle not in PRICES:
        return {"error": f"Unknown vehicle type: {vehicle}. Valid: {', '.join(PRICES.keys())}"}

    services = [s.strip().lower() for s in service_codes.split(",") if s.strip()]
    if not services:
        return {"error": "No services specified. Valid: basic, interior, full, engine"}

    breakdown = []
    total = 0
    for svc in services:
        if svc not in PRICES[vehicle]:
            return {"error": f"Unknown service: {svc}. Valid: basic, interior, full, engine"}
        price = PRICES[vehicle][svc]
        if price == 0:
            return {"error": f"Service '{svc}' is not available for {vehicle}"}
        breakdown.append({"service": svc, "price": price})
        total += price

    discount = 0
    if len(services) > 1:
        discount = round(total * MULTI_SERVICE_DISCOUNT)
        total -= discount

    return {
        "vehicle": vehicle,
        "breakdown": breakdown,
        "subtotal": sum(item["price"] for item in breakdown),
        "discount": discount,
        "discount_note": "10% multi-service discount" if discount > 0 else None,
        "total": total,
        "currency": "HKD",
    }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: estimate_price.py <vehicle_type> <service_codes>"}))
        sys.exit(1)

    result = estimate(sys.argv[1], sys.argv[2])
    print(json.dumps(result, ensure_ascii=False, indent=2))
