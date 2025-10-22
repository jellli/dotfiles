local utils = require("utils")
local builtin_opts = {
  winopts = {
    border = "single",
    preview = {
      border = "single",
    },
    height = 8,
    width = 50,
    row = 0.4,
    col = 0.48,
  },
}

local picker_opts = {
  header = false,
  file_icons = "devicons",
  git_icons = false,
  color_icons = true,
}

return {
  "ibhagwan/fzf-lua",
  dependencies = { "nvim-tree/nvim-web-devicons" },
  cmd = "FzfLua",
  keys = {
    {
      "<leader><leader>",
      function()
        require("fzf-lua").files(utils.merge(picker_opts, {
          cmd = "rg --files --hidden --ignore --glob='!.git' --sortr=modified",
          fzf_opts = { ["--scheme"] = "path", ["--tiebreak"] = "index" },
        }))
      end,
      desc = "Search Files",
    },
    {
      "<leader>sa",
      function()
        require("fzf-lua").builtin(utils.merge(builtin_opts, picker_opts))
      end,
      desc = "FZF Builtin",
    },
    {
      "<leader>sR",
      function()
        require("fzf-lua").resume(utils.merge(picker_opts, { winopts = { width = 0.80 } }))
      end,
      desc = "FZF Search Resume",
    },
    {
      "<leader>sg",
      function()
        require("fzf-lua").live_grep_native(utils.merge(picker_opts, {
          winopts = {
            width = 0.80,
            height = 0.90,
            preview = { hidden = false, layout = "horizontal" },
          },
        }))
      end,
      desc = "Live Grep",
    },
    {
      "<leader>st",
      function()
        require("fzf-lua").colorschemes(utils.merge(picker_opts, builtin_opts))
      end,
      desc = "Switch Theme",
    },
    {
      "<C-e>",
      function()
        require("fzf-lua.win").toggle_fullscreen()
        require("fzf-lua.win").toggle_preview()
      end,
      desc = "Toggle FZF fullscreen",
      mode = { "c", "i", "t" },
    },
  },
  opts = {
    "hide",
    winopts = {
      border = "single",
      height = 15,
      width = 76,
      row = 0.2,
      col = 0.5,
      preview = {
        hidden = true,
      },
    },
    hls = {
      title = "Constant",
      border = "FloatBorder",
      preview_border = "FloatBorder",
    },
    fzf_colors = {
      ["bg"] = { "bg", "FloatBorder" },
      ["bg+"] = { "bg", "FloatBorder" },

      ["fg"] = { "fg", "Comment" },
      ["fg+"] = { "fg", "PreInsert" },

      ["hl"] = { "fg", "Error" },
      ["hl+"] = { "fg", "Error" },
    },
  },
  init = function()
    vim.api.nvim_create_autocmd("User", {
      pattern = "VeryLazy",
      callback = function()
        vim.ui.select = function(...)
          require("lazy").load({ plugins = { "fzf-lua" } })
          require("fzf-lua").register_ui_select()
          return vim.ui.select(...)
        end
      end,
    })
  end,
}
