-- Save the window layout when closing a buffer.
return {
  {
    "nvim-mini/mini.bufremove",
    event = "VeryLazy",
    opts = {},
    keys = {
      {
        "<leader>bd",
        function()
          require("mini.bufremove").delete(0, false)
        end,
        desc = "Delete current buffer",
      },
    },
  },
}
