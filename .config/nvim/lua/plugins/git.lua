local solid_bar = require("icons").misc.vertical_bar
local dashed_bar = require("icons").misc.dashed_bar
local utils = require("utils")

return {
  -- Gitsign
  {
    "lewis6991/gitsigns.nvim",
    event = { "BufReadPre", "BufNewFile" },
    opts = {
      signs = {
        add = { text = solid_bar },
        untracked = { text = solid_bar },
        change = { text = solid_bar },
        delete = { text = solid_bar },
        topdelete = { text = solid_bar },
        changedelete = { text = solid_bar },
      },
      signs_staged = {
        add = { text = dashed_bar },
        untracked = { text = dashed_bar },
        change = { text = dashed_bar },
        delete = { text = dashed_bar },
        topdelete = { text = dashed_bar },
        changedelete = { text = dashed_bar },
      },
      -- preview_config = { border = "rounded" },
      current_line_blame = true,
      gh = true,
      on_attach = function(bufnr)
        local gs = package.loaded.gitsigns

        -- Register the leader group with miniclue.
        vim.b[bufnr].miniclue_config = {
          clues = {
            { mode = "n", keys = "<leader>g", desc = "+git" },
            { mode = "x", keys = "<leader>g", desc = "+git" },
          },
        }

        utils.map("[g", gs.prev_hunk, { desc = "Previous hunk" })
        utils.map("]g", gs.next_hunk, { desc = "Next hunk" })
      end,
    },
  },
  {
    "tpope/vim-fugitive",
    cmd = { "Git" },
    keys = {
      { "<leader>gs", "<cmd>Git<cr>", desc = "Git status" },
      { "<leader>ga", "<cmd>Git add %:p<cr><cr>", desc = "Git add current file" },
      { "<leader>gc", "<cmd>Git commit -v -q<cr>", desc = "Git commit" },
      { "<leader>gt", "<cmd>Git commit -v -q %:p<cr>", desc = "Git commit current file" },
      { "<leader>gd", "<cmd>Gdiff<cr>", desc = "Git diff" },
      { "<leader>ge", "<cmd>Gedit<cr>", desc = "Git edit" },
      { "<leader>gr", "<cmd>Gread<cr>", desc = "Git read" },
      { "<leader>gw", "<cmd>Gwrite<cr><cr>", desc = "Git write" },
      { "<leader>gl", "<cmd>silent! Glog<cr>:bot copen<cr>", desc = "Git log" },
      { "<leader>gp", ":Ggrep ", desc = "Git grep" },
      { "<leader>gm", ":Gmove ", desc = "Git move" },
      { "<leader>gb", ":Git branch ", desc = "Git branch" },
      { "<leader>go", ":Git checkout ", desc = "Git checkout" },
      { "<leader>gps", "<cmd>Dispatch! git push<cr>", desc = "Git push" },
      { "<leader>gpl", "<cmd>Dispatch! git pull<cr>", desc = "Git pull" },
    },
  },
  -- Git conflict
  {
    "akinsho/git-conflict.nvim",
    event = { "BufReadPre", "BufNewFile" },
    version = "*",
    config = true,
  },
}
