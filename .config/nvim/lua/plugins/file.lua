return {
  "A7Lavinraj/fyler.nvim",
  dependencies = { "nvim-tree/nvim-web-devicons" },
  opts = {
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
