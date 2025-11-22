return {
  "monkoose/neocodeium",
  event = "InsertEnter",
  opts = {
    show_label = false,
    filetypes = {
      zig = false,
    },
  },
  keys = {
    {
      "<C-f>",
      function()
        require("neocodeium").accept()
      end,
      mode = { "i" },
    },
    {
      "<A-w>",
      function()
        require("neocodeium").accept_word()
      end,
      mode = { "i" },
    },
    {
      "<A-l>",
      function()
        require("neocodeium").accept_line()
      end,
      mode = { "i" },
    },
    {
      "<A-c>",
      function()
        require("neocodeium").clear()
      end,
    },
  },
}
