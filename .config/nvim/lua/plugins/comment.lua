local utils = require("utils")
return {
  "numToStr/Comment.nvim",
  event = { "BufReadPre", "BufNewFile" },
  name = "comment.nvim",
  dependencies = {
    {
      "JoosepAlviste/nvim-ts-context-commentstring",
      event = { "BufReadPre", "BufNewFile" },
      name = "commentstring.nvim",
      opts = {
        enable_autocmd = false,
        padding = true,
        mappings = {
          basic = true,
          extra = false,
        },
      },
    },
  },
  config = function()
    ---@diagnostic disable-next-line: missing-fields
    require("Comment").setup({
      padding = true,
      sticky = true,
      pre_hook = require("ts_context_commentstring.integrations.comment_nvim").create_pre_hook(),
    })

    utils.map("<C-_>", "<esc><cmd>lua require('Comment.api').toggle.linewise(vim.fn.visualmode())<cr>", nil, "v")
    utils.map("<C-/>", "<esc><cmd>lua require('Comment.api').toggle.linewise(vim.fn.visualmode())<cr>", nil, "v")
    utils.map("<C-_>", require("Comment.api").toggle.linewise.current, nil, { "n", "i" })
    utils.map("<C-/>", require("Comment.api").toggle.linewise.current, nil, { "n", "i" })
  end,
}
