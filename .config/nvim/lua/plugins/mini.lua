local utils = require("utils")
local mini_bonus = require("mini-bonus")

local function setup_ai()
  local ai = require("mini.ai")
  ai.setup({
    n_lines = 300,
    custom_textobjects = {
      o = ai.gen_spec.treesitter({ -- code block
        a = { "@block.outer", "@conditional.outer", "@loop.outer" },
        i = { "@block.inner", "@conditional.inner", "@loop.inner" },
      }),
      f = ai.gen_spec.treesitter({ a = "@function.outer", i = "@function.inner" }, {}),
      c = ai.gen_spec.treesitter({ a = "@class.outer", i = "@class.inner" }), -- class
      t = { "<([%p%w]-)%f[^<%w][^<>]->.-</%1>", "^<.->().*()</[^/]->$" }, -- tags
      -- Whole buffer.
      g = function()
        local from = { line = 1, col = 1 }
        local to = {
          line = vim.fn.line("$"),
          col = math.max(vim.fn.getline("$"):len(), 1),
        }
        return { from = from, to = to }
      end,
    },
    -- Disable error feedback.
    silent = true,
  })
end

local function setup_pairs()
  require("mini.pairs").setup({
    modes = { insert = true, command = true, terminal = false },
    -- skip autopair when next character is one of these
    skip_next = [=[[%w%%%'%[%"%.%`%$]]=],
    -- skip autopair when the cursor is inside these treesitter nodes
    skip_ts = { "string" },
    -- skip autopair when next character is closing pair
    -- and there are more closing pairs than opening pairs
    skip_unbalanced = true,
    -- better deal with markdown code blocks
    markdown = true,
  })
end

local function setup_extra()
  require("mini.extra").setup({})
end

local function setup_pick()
  local paste_orig = vim.paste
  local mini_pick = require("mini.pick")
  mini_pick.setup({})
  ---@diagnostic disable-next-line: duplicate-set-field
  vim.paste = function(...)
    if not mini_pick.is_picker_active() then
      return paste_orig(...)
    else
      local reg_contents = vim.fn.getreg("+"):gsub("[\n\t]", " ")
      local char_table = {}
      for i = 1, #reg_contents do
        table.insert(char_table, string.sub(reg_contents, i, i))
      end
      vim.fn.strchars(reg_contents)
      mini_pick.set_picker_query(char_table)
    end
  end
end

local function settup_files()
  require("mini.files").setup({
    mappings = {
      go_in_plus = "<cr>",
      synchronize = "<c-s>",
    },
  })

  local map_split = function(buf_id, lhs, direction)
    local rhs = function()
      -- Make new window and set it as target
      local cur_target = MiniFiles.get_explorer_state().target_window
      local new_target = vim.api.nvim_win_call(cur_target, function()
        vim.cmd(direction .. " split")
        return vim.api.nvim_get_current_win()
      end)

      MiniFiles.set_target_window(new_target)
      MiniFiles.close()

      -- This intentionally doesn't act on file under cursor in favor of
      -- explicit "go in" action (`l` / `L`). To immediately open file,
      -- add appropriate `MiniFiles.go_in()` call instead of this comment.
    end

    -- Adding `desc` will result into `show_help` entries
    local desc = "Split " .. direction
    vim.keymap.set("n", lhs, rhs, { buffer = buf_id, desc = desc })
  end

  vim.api.nvim_create_autocmd("User", {
    pattern = "MiniFilesBufferCreate",
    callback = function(args)
      local buf_id = args.data.buf_id
      -- Tweak keys to your liking
      -- map_split(buf_id, "<C-s>", "belowright horizontal")
      map_split(buf_id, "<C-v>", "belowright vertical")
      map_split(buf_id, "<C-t>", "tab")
    end,
  })

  -- Yank in register full path of entry under cursor
  local yank_path = function()
    local path = (MiniFiles.get_fs_entry() or {}).path
    if path == nil then
      return vim.notify("Cursor is not on valid entry")
    end
    vim.fn.setreg(vim.v.register, path)
  end

  -- Open path with system default handler (useful for non-text files)
  local ui_open = function()
    vim.ui.open(MiniFiles.get_fs_entry().path)
  end

  vim.api.nvim_create_autocmd("User", {
    pattern = "MiniFilesBufferCreate",
    callback = function(args)
      local b = args.data.buf_id
      vim.keymap.set("n", "gx", ui_open, { buffer = b, desc = "OS open" })
      vim.keymap.set("n", "gy", yank_path, { buffer = b, desc = "Yank path" })
      vim.keymap.set("i", "<c-s>", "<esc><cmd>lua MiniFiles.synchronize()<cr>", { buffer = b, desc = "Yank path" })
    end,
  })

  vim.api.nvim_create_autocmd("User", {
    desc = "Notify LSPs that a file was renamed",
    pattern = { "MiniFilesActionRename", "MiniFilesActionMove" },
    callback = function(args)
      local changes = {
        files = {
          {
            oldUri = vim.uri_from_fname(args.data.from),
            newUri = vim.uri_from_fname(args.data.to),
          },
        },
      }
      local will_rename_method, did_rename_method = "workspace/willRenameFiles", "workspace/didRenameFiles"
      local clients = vim.lsp.get_clients()
      for _, client in ipairs(clients) do
        if client:supports_method(will_rename_method) then
          local res = client:request_sync(will_rename_method, changes, 1000, 0)
          if res and res.result then
            vim.lsp.util.apply_workspace_edit(res.result, client.offset_encoding)
          end
        end
      end

      for _, client in ipairs(clients) do
        if client:supports_method(did_rename_method) then
          client:notify(did_rename_method, changes)
        end
      end
    end,
  })
end

return {
  {
    "dmtrKovalenko/fff.nvim",
    build = function()
      require("fff.download").download_or_build_binary()
    end,
  },
  {
    "nvim-mini/mini.nvim",
    dependencies = "dmtrKovalenko/fff.nvim",
    version = false,
    config = function()
      setup_ai()
      setup_pairs()
      setup_extra()
      setup_pick()
      settup_files()

      require("mini.move").setup({
        mappings = {
          left = "H",
          right = "L",
          down = "J",
          up = "K",
        },
      })
    end,
    keys = {
      {
        "<leader>e",
        function()
          local bufname = vim.api.nvim_buf_get_name(0)
          local path = vim.fn.fnamemodify(bufname, ":p")

          -- Noop if the buffer isn't valid.
          if path and vim.uv.fs_stat(path) then
            require("mini.files").open(bufname, false)
          end
        end,
        desc = "File explorer",
      },

      {
        "<leader><leader>",
        mini_bonus.fff.run,
        desc = "Search Files",
      },
      {
        "<leader>sg",
        function()
          MiniPick.builtin.grep_live()
        end,
        desc = "Live Grep",
      },
      {
        "<leader>st",
        function()
          MiniExtra.pickers.colorschemes()
        end,
        desc = "Switch Theme",
      },
      {
        "<leader>sd",
        function()
          MiniExtra.pickers.diagnostic()
        end,
        desc = "Search diagnostic",
      },
      {
        "<leader>sc",
        function()
          MiniExtra.pickers.commands()
        end,
        desc = "Search commands",
      },
      {
        "<leader>sk",
        function()
          MiniExtra.pickers.keymaps()
        end,
        desc = "Search commands",
      },
    },
  },
}
