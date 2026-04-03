local get_library = function()
	local lib = {
		vim.env.VIMRUNTIME,
		"${3rd}/luv/library",
	}
	local opt_dir = vim.fn.stdpath("data") .. "/site/pack/core/opt"
	for _, name in ipairs(vim.fn.readdir(opt_dir)) do
		local lua_dir = opt_dir .. "/" .. name .. "/lua"
		if vim.fn.isdirectory(lua_dir) == 1 then
			table.insert(lib, lua_dir)
		end
	end
	return lib
end

local get_runtime_path = function()
	local path = {
		"?.lua",
		"?/init.lua",
	}
	table.insert(path, vim.env.VIMRUNTIME .. "/lua/?.lua")
	table.insert(path, vim.env.VIMRUNTIME .. "/lua/?/init.lua")
	local opt_dir = vim.fn.stdpath("data") .. "/site/pack/core/opt"
	for _, name in ipairs(vim.fn.readdir(opt_dir)) do
		local lua_dir = opt_dir .. "/" .. name .. "/lua"
		if vim.fn.isdirectory(lua_dir) == 1 then
			table.insert(path, lua_dir .. "/?.lua")
			table.insert(path, lua_dir .. "/?/init.lua")
		end
	end
	return path
end

---@type vim.lsp.Config
return {
	cmd = { "lua-language-server" },
	filetypes = { "lua" },
	root_markers = { ".luarc.json", ".luarc.jsonc" },
	settings = {
		Lua = {
			format = { enable = true },
			hint = {
				enable = true,
				arrayIndex = "Disable",
			},
			runtime = {
				version = "LuaJIT",
				path = get_runtime_path(),
			},
			workspace = {
				checkThirdParty = false,
				library = get_library(),
			},
			diagnostics = {
				globals = { "vim" },
			},
		},
	},
}
