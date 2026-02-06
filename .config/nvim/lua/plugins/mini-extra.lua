return {
  "nvim-mini/mini.extra",
  opts = {},
  keys = {
    {
      "<leader>st",
      function()
        require("mini.extra").pickers.colorschemes()
      end,
      desc = "Switch Theme",
    },
    {
      "<leader>sd",
      function()
        require("mini.extra").pickers.diagnostic()
      end,
      desc = "Search diagnostic",
    },
    {
      "<leader>sc",
      function()
        require("mini.extra").pickers.commands()
      end,
      desc = "Search commands",
    },
    {
      "<leader>sk",
      function()
        require("mini.extra").pickers.keymaps()
      end,
      desc = "Search commands",
    },
    {
      "<leader>sh",
      function()
        require("mini.extra").pickers.hl_groups()
      end,
      desc = "Search highlight group",
    },
  },
}
