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
        map("[h", gs.prev_hunk, { desc = "Previous hunk" })
        map("]h", gs.next_hunk, { desc = "Next hunk" })
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
        "<leader>hp",
        "<cmd>Gitsign preview_hunk_inline<cr>",
        desc = "Preview hunk",
      },
      {
        "<leader>hs",
        "<cmd>Gitsign stage_hunk<cr>",
        desc = "Stage hunk",
      },
      {
        "<leader>hr",
        "<cmd>Gitsign reset_hunk<cr>",
        desc = "Reset hunk",
      },
    },
  },
  {
    "tpope/vim-fugitive",
    cmd = {
      "Git",
    },
    keys = {
      { "<leader>ge", "<cmd>Gedit<cr>", desc = "Git edit" },
      { "<leader>gs", "<cmd>Git<cr>", desc = "Git status" },
      { "<leader>ga", "<cmd>Git add %<cr>", desc = "Git add current file" },
      { "<leader>gw", "<cmd>Gwrite<cr>", desc = "Git write" },
      { "<leader>gr", "<cmd>Gread<cr>", desc = "Git read" },
      { "<leader>gc", "<cmd>Git commit -v -q<cr>", desc = "Git commit" },
      { "<leader>gt", "<cmd>Git commit -v -q %:p<cr>", desc = "Git commit current file" },
      { "<leader>gd", "<cmd>Gvdiffsplit<cr>", desc = "Git diff" },
      {
        "<leader>gl",
        "<cmd>vert Git --paginate log --graph --pretty=format:'%C(magenta)%h %C(white) %an (%ar)%C(auto) %D%n%s%n'<cr>",
        desc = "Git log",
      },
      { "<leader>gP", "<cmd>Git push<cr>", desc = "Git push" },
      { "<leader>gp", "<cmd>Git pull<cr>", desc = "Git pull" },
    },
  },
}
