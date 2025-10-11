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
  -- Neogit
  {
    "NeogitOrg/neogit",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "sindrets/diffview.nvim",
      "ibhagwan/fzf-lua",
    },
    opts = {
      graph_style = "unicode",
      process_spinner = true,
      highlight = {
        italic = true,
        bold = true,
        underline = true,
      },
      signs = {
        section = { "", "" },
        item = { "", "" },
        hunk = { "", "" },
      },
      integrations = {
        diffview = true,
        fzf_lua = true,
      },
      git_services = {
        ["gitlab.tangees.com"] = {
          pull_request = "https://gitlab.tangees.com/${owner}/${repository}/merge_requests/new?merge_request[source_branch]=${branch_name}",
          commit = "https://gitlab.tangees.com/${owner}/${repository}/-/commit/${oid}",
          tree = "https://gitlab.tangees.com/${owner}/${repository}/-/tree/${branch_name}?ref_type=heads",
        },
      },
    },
    keys = {
      {
        "<leader>gg",
        function()
          require("neogit").open()
        end,
        desc = "Neogit",
      },
    },
  },
  -- Git conflict
  { "akinsho/git-conflict.nvim", version = "*", config = true },
}
