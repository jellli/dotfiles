return {
  { "folke/ts-comments.nvim", event = "VeryLazy", opts = {} },
  {
    "folke/todo-comments.nvim",
    event = "BufRead",
    dependencies = { "nvim-lua/plenary.nvim" },
    opts = {},
  },
}
