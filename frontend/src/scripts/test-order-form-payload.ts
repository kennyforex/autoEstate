import { buildOrderPayload } from "../utils/orderFormPayload";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const payload = buildOrderPayload({
  draft: {
    clientName: "",
    phoneNumber: "",
    email: "",
    shippingAddress: "",
    shippingMethodId: undefined,
    shippingMethod: "",
    deliveryDate: undefined,
    status: "open",
    paymentStatus: "unpaid",
    fulfillmentStatus: "unfulfilled",
    currency: "HKD",
    discountTotal: 0,
    shippingFee: 0,
    taxTotal: 0,
    tagIds: [],
  },
  items: [
    {
      snapshot: { productName: "Chocolate Cake", productId: undefined },
      quantity: 1,
      unitPrice: 288,
      notes: "",
    },
  ],
});

assertEqual("email" in payload, false, "blank email must be omitted to pass backend optional email validation");
assertEqual("shippingMethodId" in payload, false, "blank shippingMethodId must be omitted to pass MongoId validation");
assertEqual("deliveryDate" in payload, false, "blank deliveryDate must be omitted to pass ISO date validation");
assertEqual(
  "productId" in payload.items[0].snapshot,
  false,
  "blank item productId must be omitted to pass MongoId validation",
);
assertEqual(payload.items[0].notes, undefined, "blank item notes should be omitted");

console.log("order form payload normalization ok");
