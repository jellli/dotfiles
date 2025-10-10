return {
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
}
