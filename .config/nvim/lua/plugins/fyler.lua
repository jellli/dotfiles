return {
  "A7Lavinraj/fyler.nvim",
  dependencies = { "nvim-tree/nvim-web-devicons" },
  --- @type FylerConfig
  ---@diagnostic disable-next-line: missing-fields
  opts = {
    views = {
      finder = {
        confirm_simple = true,
        delete_to_trash = true,
        indentscope = {
          enabled = true,
          group = "Indent",
          marker = "┆",
        },
      },
    },
    integrations = {
      icon = "nvim_web_devicons",
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
