---@diagnostic disable: missing-fields
return {
  "folke/snacks.nvim",
  priority = 1000,
  lazy = false,
  ---@type snacks.Config
  opts = {
    quickfile = {},
    bigfile = {},
    input = {},
    indent = require("plugins.snacks.indent"),
    dashboard = require("plugins.snacks.dashboard"),
    notifier = require("plugins.snacks.notifier"),
    lazygit = {
      theme = {
        inactiveBorderColor = { fg = "Comment" },
      },
    },
    styles = {
      input = {
        backdrop = false,
        border = "single",
        title_pos = "left",
        wo = {
          winhighlight = "NormalFloat:Special,FloatBorder:FloatBorder,FloatTitle:Special",
          cursorline = false,
        },
      },
    },
  },
  keys = {
    {
      "<leader>bd",
      function()
        Snacks.bufdelete()
      end,
      desc = "Delete Buffer",
    },
    {
      "<leader>lg",
      function()
        Snacks.lazygit()
      end,
      desc = "Lazygit",
    },
    {
      "<leader>nh",
      function()
        Snacks.notifier.show_history()
      end,
      desc = "Notification History",
    },
  },
}
