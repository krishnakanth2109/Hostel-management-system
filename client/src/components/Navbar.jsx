import React from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

const Navbar = () => {
  const navigate = useNavigate();
  const storedUser = JSON.parse(localStorage.getItem("user") || "{}");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    toast.success("Logged out successfully");
    navigate("/login");
  };

  return (
    <nav className="fixed top-0 left-0 z-50 w-full h-16 bg-white border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700 shadow-sm flex items-center justify-between px-6">
      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
        MyApp
      </div>
      
      <div className="flex items-center gap-4">
        <span className="text-gray-700 dark:text-gray-200 font-medium hidden sm:block">
          Hi, {storedUser.owner || "User"}
        </span>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none transition-colors"
        >
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navbar;