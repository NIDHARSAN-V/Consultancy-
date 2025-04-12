import React, { useEffect, useState } from 'react'
import { useAppContext } from '../../context/AppContext'
import { assets } from '../../assets/assets'
import toast from 'react-hot-toast'

const Orders = () => {
    const { currency, axios } = useAppContext()
    const [orders, setOrders] = useState([])

    const fetchOrders = async () => {
        try {
            const { data } = await axios.get('/api/order/seller');
            if (data.success) {
                setOrders(data.orders)
            } else {
                toast.error(data.message)
            }
        } catch (error) {
            toast.error(error.message)
        }
    }

    const cancelOrderByAdmin = async (orderId) => {
        const confirm = window.confirm("Are you sure you want to cancel this order?");
        if (!confirm) return;

        try {
            const { data } = await axios.put(`/api/order/cancel/seller/${orderId}`);
            if (data.success) {
                toast.success("Order cancelled successfully!");
                fetchOrders();
            } else {
                toast.error(data.message);
            }
        } catch (error) {
            toast.error("Failed to cancel order.");
            console.log(error);
        }
    }

    useEffect(() => {
        fetchOrders();
    }, [])

    return (
        <div className='no-scrollbar flex-1 h-[95vh] overflow-y-scroll'>
            <div className="md:p-10 p-4 space-y-4">
                <h2 className="text-lg font-medium">Orders List</h2>
                {orders.map((order, index) => (
                    <div key={index} className="flex flex-col md:items-center md:flex-row gap-5 justify-between p-5 max-w-4xl rounded-md border border-gray-300">

                        <div className="flex gap-5 max-w-80">
                            <img className="w-12 h-12 object-cover" src={assets.box_icon} alt="boxIcon" />
                            <div>
                                {order.items.map((item, index) => (
                                    <div key={index} className="flex flex-col">
                                        <p className="font-medium">
                                            {item.product.name}{" "}
                                            <span className="text-primary">x {item.quantity}</span>
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="text-sm md:text-base text-black/60">
                            <p className='text-black/80'>
                                {order.address.firstName} {order.address.lastName}
                            </p>
                            <p>{order.address.street}, {order.address.city}</p>
                            <p>{order.address.state}, {order.address.zipcode}, {order.address.country}</p>
                            <p>{order.address.phone}</p>
                        </div>

                        <p className="font-medium text-lg my-auto">
                            {currency}{order.amount}
                        </p>

                        <div className="flex flex-col text-sm md:text-base text-black/60">
                            <p>Method: {order.paymentType}</p>
                            <p>Date: {new Date(order.createdAt).toLocaleDateString()}</p>
                            <p>Payment: {order.isPaid ? "Paid" : "Pending"}</p>
                            <p>Status: {order.status}</p>

                            {/* Cancel Button */}
                            {(!order.isPaid && order.status !== "Cancelled") && (
                                <button
                                    onClick={() => cancelOrderByAdmin(order._id)}
                                    className="mt-2 bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600 transition"
                                >
                                    Cancel Order
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default Orders
