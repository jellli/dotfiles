return {
  "A7Lavinraj/fyler.nvim",
  dependencies = { "nvim-tree/nvim-web-devicons" },
  --- @type FylerConfig
  ---@diagnostic disable-next-line: missing-fields
  opts = {
    confirm_simple = true,
    icon_provider = "nvim_web_devicons",
    indentscope = {
      enabled = true,
      group = "Indent",
      marker = "┆",
    },
  },
  keys = {
    {

      "<leader>e",
      function()
        require("fyler").toggle({
          kind = "split_left",
        })
      end,
      desc = "File explorer",
    },
  },
}
