-- Pretty bufferline.
return {
  {
    "akinsho/bufferline.nvim",
    event = "VeryLazy",
    opts = {
      options = {
        sort_by = "insert_at_end",
        show_close_icon = false,
        show_buffer_close_icons = false,
        truncate_names = false,
        -- indicator = { style = "underline" },
        close_command = function(bufnr)
          Snacks.bufdelete({
            buf = bufnr,
            force = true,
          })
        end,
        diagnostics = "nvim_lsp",
        diagnostics_indicator = function(_, _, diag)
          local icons = require("icons").diagnostics
          local indicator = (diag.error and icons.ERROR .. " " or "") .. (diag.warning and icons.WARN or "")
          return vim.trim(indicator)
        end,
      },
    },
    keys = {
      -- Buffer navigation.
      { "<leader>bc", "<cmd>BufferLinePick<cr>", desc = "Pick a buffer to open" },
      { "<leader>bo", "<cmd>BufferLineCloseOthers<cr><C-w><C-o>", desc = "Close other buffers" },
    },
  },
}
