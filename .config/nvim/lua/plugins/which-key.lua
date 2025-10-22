return {
  {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {
      preset = "helix",
      spec = {
        {
          "<leader>a",
          group = "AI",
        },
        {
          "<leader>b",
          group = "Buffer",
          expand = function()
            return require("which-key.extras").expand.buf()
          end,
        },
        {
          "<leader>c",
          group = "Code",
        },
        {
          "<leader>g",
          group = "Git",
        },
        {
          "<leader>o",
          group = "Overseer",
        },
        {
          "<leader>ob",
          group = "Obsidian",
        },
      },
    },
    keys = {
      {
        "<leader>?",
        function()
          require("which-key").show({ global = false })
        end,
        desc = "Buffer Local Keymaps (which-key)",
      },
    },
  },
}
