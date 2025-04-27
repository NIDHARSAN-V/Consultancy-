import Order from "../models/Order.js";
import Product from "../models/Product.js";
import stripe from "stripe";
import User from "../models/User.js";

// Place Order COD : /api/order/cod
export const placeOrderCOD = async (req, res) => {
  try {
    const { userId, items, address } = req.body;
    if (!address || items.length === 0) {
      return res.json({ success: false, message: "Invalid data" });
    }
    // Calculate Amount Using Items
    let amount = await items.reduce(async (acc, item) => {
      const product = await Product.findById(item.product);
      return (await acc) + product.offerPrice * item.quantity;
    }, 0);

    // Add Tax Charge (2%)
    amount += Math.floor(amount * 0.02);

    // await Order.create({
    //   userId,
    //   items,
    //   amount,
    //   address,
    //   paymentType: "COD",
    // });


console.log(req.body)
    // In both placeOrderCOD and placeOrderStripe functions:
await Order.create({
  userId,
  items,
  amount,
  address,
  paymentType: "COD", // or "Online"
  status: "Placed", // Explicitly set initial status
  isPaid: true // Set to true for online payments
});

    return res.json({ success: true, message: "Order Placed Successfully" });
  } catch (error) {
    console.log(error.message)
    return res.json({ success: false, message: error.message });
  }
};

// Place Order Stripe : /api/order/stripe
export const placeOrderStripe = async (req, res) => {
  try {
    const { userId, items, address } = req.body;
    const { origin } = req.headers;

    if (!address || items.length === 0) {
      return res.json({ success: false, message: "Invalid data" });
    }

    let productData = [];

    // Calculate Amount Using Items
    let amount = await items.reduce(async (acc, item) => {
      const product = await Product.findById(item.product);
      productData.push({
        name: product.name,
        price: product.offerPrice,
        quantity: item.quantity,
      });
      return (await acc) + product.offerPrice * item.quantity;
    }, 0);

    // Add Tax Charge (2%)
    amount += Math.floor(amount * 0.02);

    if (amount < 50) {
      return res.json({
        success: false,
        message:
          "Minimum order amount must be at least ₹50 for online payments.",
      });
    }

    // const order = await Order.create({
    //   userId,
    //   items,
    //   amount,
    //   address,
    //   paymentType: "Online",
    // });


    // In both placeOrderCOD and placeOrderStripe functions:
await Order.create({
  userId,
  items,
  amount,
  address,
  paymentType: "COD", // or "Online"
  status: "Placed", // Explicitly set initial status
  isPaid: false // Set to true for online payments
});

    // Stripe Gateway Initialize
    const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);

    // create line items for stripe

    const line_items = productData.map((item) => {
      return {
        price_data: {
          currency: "inr",
          product_data: {
            name: item.name,
          },
          unit_amount: Math.floor(item.price + item.price * 0.02) * 100,
        },
        quantity: item.quantity,
      };
    });

    // create session
    const session = await stripeInstance.checkout.sessions.create({
      line_items,
      mode: "payment",
      success_url: `${origin}/loader?next=my-orders`,
      cancel_url: `${origin}/cart`,
      metadata: {
        orderId: order._id.toString(),
        userId,
      },
    });

    return res.json({ success: true, url: session.url });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};
// Stripe Webhooks to Verify Payments Action : /stripe
export const stripeWebhooks = async (request, response) => {
  // Stripe Gateway Initialize
  const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);

  const sig = request.headers["stripe-signature"];
  let event;

  try {
    event = stripeInstance.webhooks.constructEvent(
      request.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    response.status(400).send(`Webhook Error: ${error.message}`);
  }

  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object;
      const paymentIntentId = paymentIntent.id;

      // Getting Session Metadata
      const session = await stripeInstance.checkout.sessions.list({
        payment_intent: paymentIntentId,
      });

      const { orderId, userId } = session.data[0].metadata;
      // Mark Payment as Paid
      await Order.findByIdAndUpdate(orderId, { isPaid: true });
      // Clear user cart
      await User.findByIdAndUpdate(userId, { cartItems: {} });
      break;
    }
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object;
      const paymentIntentId = paymentIntent.id;

      // Getting Session Metadata
      const session = await stripeInstance.checkout.sessions.list({
        payment_intent: paymentIntentId,
      });

      const { orderId } = session.data[0].metadata;
      await Order.findByIdAndDelete(orderId);
      break;
    }

    default:
      console.error(`Unhandled event type ${event.type}`);
      break;
  }
  response.json({ received: true });
};

// Get Orders by User ID : /api/order/user
export const getUserOrders = async (req, res) => {
  try {
    const { userId } = req.body;
    const orders = await Order.find({
      userId,
      $or: [{ paymentType: "COD" }, { isPaid: true }],
      status: { $ne: "Cancelled" },
    })
      .populate("items.product address")
      .sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Get All Orders ( for seller / admin) : /api/order/seller
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      $or: [{ paymentType: "COD" }, { isPaid: true }],
    })
      .populate("items.product address")
      .sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Cancel Order by Admin/Seller: /api/order/cancel/seller/:orderId
export const cancelOrderByAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (["Delivered", "Cancelled"].includes(order.status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Cannot cancel ${order.status} order`,
        });
    }

    order.status = "Cancelled";
    await order.save();

    res.json({
      success: true,
      message: "Order cancelled by admin/seller",
      order,
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Cancel Order by User: /api/order/cancel/user/:orderId
export const cancelOrderByUser = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { userId } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.userId.toString() !== userId) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Not authorized to cancel this order",
        });
    }

    if (["Shipped", "Delivered", "Cancelled"].includes(order.status)) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Cannot cancel ${order.status} order`,
        });
    }

    order.status = "Cancelled";
    await order.save();

    res.json({ success: true, message: "Order cancelled successfully", order });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};





// Update Order Status : /api/order/update-status/:orderId
export const updateOrderStatus = async (req, res) => {
  try {
      const { orderId } = req.params;
      const { status } = req.body;

      const validStatuses = ["Placed", "Out for Delivery", "Delivered", "Cancelled"];
      
      if (!validStatuses.includes(status)) {
          return res.status(400).json({
              success: false,
              message: "Invalid status value"
          });
      }

      const order = await Order.findByIdAndUpdate(
          orderId,
          { status },
          { new: true }
      ).populate("items.product address");

      if (!order) {
          return res.status(404).json({
              success: false,
              message: "Order not found"
          });
      }

      res.json({
          success: true,
          message: "Order status updated successfully",
          order
      });
  } catch (error) {
      res.status(500).json({
          success: false,
          message: error.message
      });
  }
};
