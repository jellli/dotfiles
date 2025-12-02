local map = require("utils").map

return {
  -- Gitsign
  {
    "lewis6991/gitsigns.nvim",
    event = { "BufReadPre", "BufNewFile" },
    opts = {
      -- preview_config = { border = "rounded" },
      current_line_blame = false,
      gh = true,
      on_attach = function(bufnr)
        local gs = package.loaded.gitsigns
        map("[g", gs.prev_hunk, { desc = "Previous hunk" })
        map("]g", gs.next_hunk, { desc = "Next hunk" })
      end,
    },
    keys = {
      {
        "<leader>gb",
        "<cmd>Gitsign blame<cr>",
        desc = "Blame line",
      },
      {
        "<leader>twd",
        "<cmd>Gitsign toggle_word_diff<cr>",
        desc = "Toggle word diff",
      },
      {
        "<leader>tlb",
        "<cmd>Gitsign toggle_current_line_blame<cr>",
        desc = "Toggle current line blame",
      },

      {
        "<leader>ghp",
        "<cmd>Gitsign preview_hunk_inline<cr>",
        desc = "Preview hunk",
      },
      {
        "<leader>ghs",
        "<cmd>Gitsign stage_hunk<cr>",
        desc = "Stage hunk",
      },
      {
        "<leader>ghr",
        "<cmd>Gitsign reset_hunk<cr>",
        desc = "Reset hunk",
      },
    },
  },
  {
    "tpope/vim-fugitive",
    cmd = { "Git" },
    keys = {
      -- { "<leader>gf", ":Git ", desc = "Fugitive" },
      { "<leader>gs", "<cmd>Git<cr>", desc = "Git status" },
      { "<leader>ga", "<cmd>Git add %:p<cr><cr>", desc = "Git add current file" },
      { "<leader>gc", "<cmd>Git commit -v -q<cr>", desc = "Git commit" },
      { "<leader>gt", "<cmd>Git commit -v -q %:p<cr>", desc = "Git commit current file" },
      { "<leader>gd", "<cmd>Gdiff<cr>", desc = "Git diff" },
      -- { "<leader>ge", "<cmd>Gedit<cr>", desc = "Git edit" },
      -- { "<leader>gr", "<cmd>Gread<cr>", desc = "Git read" },
      -- { "<leader>gw", "<cmd>Gwrite<cr><cr>", desc = "Git write" },
      { "<leader>gl", "<cmd>silent! Glog<cr>:bot copen<cr>", desc = "Git log" },
      { "<leader>gp", ":Ggrep ", desc = "Git grep" },
      { "<leader>gm", ":Gmove ", desc = "Git move" },
      -- { "<leader>gb", ":Git branch ", desc = "Git branch" },
      -- { "<leader>go", ":Git checkout ", desc = "Git checkout" },
      { "<leader>gP", "<cmd>Git push<cr>", desc = "Git push" },
      { "<leader>gp", "<cmd>Git pull<cr>", desc = "Git pull" },
    },
  },
}
