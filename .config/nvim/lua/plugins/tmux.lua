return {
  "mrjones2014/smart-splits.nvim",
  keys = {
    -- stylua: ignore start
    { "<A-h>", function() require("smart-splits").resize_left() end, desc = "Resize left" },
    { "<A-j>", function() require("smart-splits").resize_down() end, desc = "Resize down" },
    { "<A-k>", function() require("smart-splits").resize_up() end, desc = "Resize up" },
    { "<A-l>", function() require("smart-splits").resize_right() end, desc = "Resize right" },
    { "<C-h>", function() require("smart-splits").move_cursor_left() end, desc = "Move left" },
    { "<C-j>", function() require("smart-splits").move_cursor_down() end, desc = "Move down" },
    { "<C-k>", function() require("smart-splits").move_cursor_up() end, desc = "Move up" },
    { "<C-l>", function() require("smart-splits").move_cursor_right() end, desc = "Move right" },
    { "<C-\\>", function() require("smart-splits").move_cursor_previous() end, desc = "Move previous" },
    -- stylua: ignore end
  },
  opts = {
    ignored_filetypes = {},
    at_edge = "stop",
    resize_mode = {
      quit_key = "<ESC>",
      resize_keys = { "h", "j", "k", "l" },
      silent = false,
      hooks = {
        on_enter = nil,
        on_leave = nil,
      },
    },
  },
}
