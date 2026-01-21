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

  local sep = package.config:sub(1, 1)
  local function truncate_path(path)
    local parts = vim.split(path, sep)
    if #parts > 3 then
      parts = { parts[1], "…", parts[#parts - 1], parts[#parts] }
    end
    return table.concat(parts, sep)
  end

  local function map_gsub(items, pattern, replacement)
    return vim.tbl_map(function(item)
      item, _ = string.gsub(item, pattern, replacement)
      return item
    end, items)
  end

  local show_align_on_nul = function(buf_id, items, query, opts)
    -- Shorten the pathname to keep the width of the picker window to something
    -- a bit more reasonable for longer pathnames.
    items = map_gsub(items, "^%Z+", truncate_path)

    -- Because items is an array of blobs (contains a NUL byte), align_strings
    -- will not work because it expects strings. So, convert the NUL bytes to a
    -- unique (hopefully) separator, then align, and revert back.
    items = map_gsub(items, "%z", "#|#")
    items = require("mini.align").align_strings(items, {
      justify_side = { "left", "right", "right" },
      merge_delimiter = { "", " ", "", " ", "" },
      split_pattern = "#|#",
    })
    items = map_gsub(items, "#|#", "\0")

    -- Back to the regularly scheduled program :-)
    MiniPick.default_show(buf_id, items, query, opts)
  end

  MiniPick.registry.grep_live_align = function()
    MiniPick.builtin.grep_live({}, {
      source = { show = show_align_on_nul },
      window = { config = { width = math.floor(0.816 * vim.o.columns) } },
    })
  end

  MiniPick.registry.fff_picker = require("mini-bonus").fff.run
  MiniPick.registry.buffers_with_diagnostics = require("mini-bonus").buffers.run
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

local last_buf_name

return {
  {
    "dmtrKovalenko/fff.nvim",
    -- commit = "d88922e6c74b357cfd029128ce5ecd813b6eb747",
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
            last_buf_name = bufname
            require("mini.files").open(bufname, false)
          else
            if last_buf_name then
              require("mini.files").open(last_buf_name, false)
            else
              local cwd = vim.fn.getcwd()
              last_buf_name = cwd
              require("mini.files").open(cwd, false)
            end
          end
        end,
        desc = "File explorer",
      },
      {
        "<leader><leader>",
        function()
          MiniPick.registry.fff_picker()
        end,
        desc = "Search Files",
      },
      {
        "<leader>sR",
        function()
          MiniPick.builtin.resume()
        end,
        desc = "Live Grep",
      },
      {
        "<leader>sg",
        function()
          MiniPick.registry.grep_live_align()
        end,
        desc = "Live Grep",
      },
      {
        "<leader>sb",
        function()
          MiniPick.registry.buffers_with_diagnostics()
        end,
        desc = "Search buffers",
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
      {
        "<leader>sh",
        function()
          MiniExtra.pickers.hl_groups()
        end,
        desc = "Search highlight group",
      },
    },
  },
}
