local utils = require("utils")
local M = {}

M.installed = {}

return {
  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    branch = "main",
    version = false,
    lazy = false,
    config = function()
      require("nvim-treesitter").setup({
        highlight = { enable = true },
        indent = {
          enable = true,
        },
      })
      require("nvim-treesitter").install({
        "bash",
        "c",
        "css",
        "go",
        "html",
        "javascript",
        "json",
        "lua",
        "toml",
        "tsx",
        "typescript",
        "vim",
        "vimdoc",
        "yaml",
        "zig",
      })

      for _, lang in ipairs(require("nvim-treesitter").get_installed()) do
        M.installed[lang] = true
      end

      vim.api.nvim_create_autocmd("FileType", {
        group = utils.creat_group("treesitter"),
        callback = function(ev)
          if M.installed[vim.treesitter.language.get_lang(ev.match)] then
            pcall(vim.treesitter.start)
            vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
            vim.wo[0][0].foldexpr = "v:lua.vim.treesitter.foldexpr()"
            vim.wo[0][0].foldmethod = "expr"
          end
        end,
      })
    end,
  },
  {
    "nvim-treesitter/nvim-treesitter-textobjects",
    branch = "main",
    event = "VeryLazy",
    opts = {},
    keys = function()
      local moves = {
        goto_next_start = { ["]f"] = "@function.outer", ["]c"] = "@class.outer", ["]a"] = "@parameter.inner" },
        goto_next_end = { ["]F"] = "@function.outer", ["]C"] = "@class.outer", ["]A"] = "@parameter.inner" },
        goto_previous_start = {
          ["[f"] = "@function.outer",
          ["[c"] = "@class.outer",
          ["[a"] = "@parameter.inner",
        },
        goto_previous_end = { ["[F"] = "@function.outer", ["[C"] = "@class.outer", ["[A"] = "@parameter.inner" },
      }
      local ret = {}
      for method, keymaps in pairs(moves) do
        for key, query in pairs(keymaps) do
          local desc = query:gsub("@", ""):gsub("%..*", "")
          desc = desc:sub(1, 1):upper() .. desc:sub(2)
          desc = (key:sub(1, 1) == "[" and "Prev " or "Next ") .. desc
          desc = desc .. (key:sub(2, 2) == key:sub(2, 2):upper() and " End" or " Start")
          ret[#ret + 1] = {
            key,
            function()
              -- don't use treesitter if in diff mode and the key is one of the c/C keys
              if vim.wo.diff and key:find("[cC]") then
                return vim.cmd("normal! " .. key)
              end
              require("nvim-treesitter-textobjects.move")[method](query, "textobjects")
            end,
            desc = desc,
            mode = { "n", "x", "o" },
            silent = true,
          }
        end
      end
      return ret
    end,
  },
  {
    "Wansmer/treesj",
    keys = {
      {
        "<leader>sj",
        mode = { "n" },
        function()
          require("treesj").toggle()
        end,
        desc = "Toggle Split Join",
      },
    },
    dependencies = { "nvim-treesitter/nvim-treesitter" },
    config = function()
      require("treesj").setup({
        use_default_keymaps = false,
        max_join_length = 200,
      })
    end,
  },
}
