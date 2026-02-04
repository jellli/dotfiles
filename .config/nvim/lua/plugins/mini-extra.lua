return {
  "nvim-mini/mini.extra",
  opts = {},
  keys = {
    {
      "<leader>st",
      function()
        MiniExtra.pickers.colorschemes()
      end,
      desc = "Switch Theme",
    },
    {
      "<leader>sd",
      function()
        MiniExtra.pickers.diagnostic()
      end,
      desc = "Search diagnostic",
    },
    {
      "<leader>sc",
      function()
        MiniExtra.pickers.commands()
      end,
      desc = "Search commands",
    },
    {
      "<leader>sk",
      function()
        MiniExtra.pickers.keymaps()
      end,
      desc = "Search commands",
    },
    {
      "<leader>sh",
      function()
        MiniExtra.pickers.hl_groups()
      end,
      desc = "Search highlight group",
    },
  },
}
